import { useCallback, useEffect, useRef, useState } from "react";
import {
  createObjection,
  mergeScanResults,
  openObjections,
  scanLiveObjections,
  type LiveObjection,
} from "../lib/liveObjections";
import {
  MEETING_PLATFORMS,
  getLinkedPlatform,
  setLinkedPlatform,
  type MeetingPlatformId,
} from "../lib/meetingPlatforms";
import {
  fetchZoomStatus,
  startZoomLiveSession,
  subscribeZoomTranscriptStream,
  zoomConnectUrl,
  type ZoomIntegrationStatus,
} from "../lib/zoomIntegration";
import {
  fetchGoogleMeetStatus,
  googleMeetConnectUrl,
  type GoogleMeetStatus,
} from "../lib/googleMeetIntegration";
import { fetchTeamsStatus, teamsConnectUrl, type TeamsStatus } from "../lib/teamsIntegration";
import type { LiveTranscriptTurn } from "../types";

interface Props {
  dealValue: string;
  apiOnline: boolean | null;
  onLiveUpdate?: (snapshot: {
    active: boolean;
    platform: MeetingPlatformId | null;
    turns: LiveTranscriptTurn[];
    objections: LiveObjection[];
  }) => void;
  onEndSession: (
    turns: LiveTranscriptTurn[],
    formattedTranscript: string,
    objections: LiveObjection[]
  ) => void;
}

type SessionPhase = "idle" | "live";

/** Browser SpeechRecognition (Chrome / Edge). */
type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((e: {
        results: {
          length: number;
          [i: number]: { transcript: string };
        };
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function formatTurns(turns: LiveTranscriptTurn[]): string {
  return turns
    .map((t) => {
      const ts = t.timestamp ? `[${t.timestamp}] ` : "";
      return `${ts}${t.speaker}: ${t.dialogue}`;
    })
    .join("\n");
}

function parseNoteLine(line: string): { speaker: string; dialogue: string } {
  const buyerMatch = line.match(/^(?:buyer|prospect|customer)\s*:\s*(.+)/i);
  if (buyerMatch) return { speaker: "Buyer", dialogue: buyerMatch[1].trim() };
  const repMatch = line.match(/^rep\s*:\s*(.+)/i);
  if (repMatch) return { speaker: "Rep", dialogue: repMatch[1].trim() };
  return { speaker: "Note", dialogue: line };
}

export default function MeetingCompanion({
  dealValue,
  apiOnline,
  onLiveUpdate,
  onEndSession,
}: Props) {
  const [platform, setPlatform] = useState<MeetingPlatformId | null>(() => getLinkedPlatform());
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [objections, setObjections] = useState<LiveObjection[]>([]);
  const [manualObjection, setManualObjection] = useState("");
  const [listening, setListening] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [zoomStatus, setZoomStatus] = useState<ZoomIntegrationStatus | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleMeetStatus | null>(null);
  const [teamsStatus, setTeamsStatus] = useState<TeamsStatus | null>(null);
  const [zoomStreamActive, setZoomStreamActive] = useState(false);

  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const turnsRef = useRef(turns);
  const objectionsRef = useRef(objections);
  const zoomUnsubRef = useRef<(() => void) | null>(null);
  const zoomSessionIdRef = useRef<string | null>(null);

  const transcript = formatTurns(turns);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    objectionsRef.current = objections;
  }, [objections]);

  useEffect(() => {
    onLiveUpdate?.({
      active: phase === "live",
      platform,
      turns,
      objections,
    });
  }, [phase, platform, turns, objections, onLiveUpdate]);

  useEffect(() => {
    if (platform === "zoom") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("zoom") === "connected") {
        params.delete("zoom");
        const next = params.toString();
        window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
      }
      void fetchZoomStatus()
        .then(setZoomStatus)
        .catch(() => setZoomStatus(null));
      return;
    }
    if (platform === "meet") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("google") === "connected") {
        params.delete("google");
        const next = params.toString();
        window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
      }
      void fetchGoogleMeetStatus()
        .then(setGoogleStatus)
        .catch(() => setGoogleStatus(null));
      return;
    }
    if (platform === "teams") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("teams") === "connected") {
        params.delete("teams");
        const next = params.toString();
        window.history.replaceState({}, "", next ? `?${next}` : window.location.pathname);
      }
      void fetchTeamsStatus()
        .then(setTeamsStatus)
        .catch(() => setTeamsStatus(null));
    }
  }, [platform]);

  useEffect(() => {
    return () => {
      zoomUnsubRef.current?.();
      zoomUnsubRef.current = null;
    };
  }, []);

  const appendTurn = useCallback((speaker: string, dialogue: string) => {
    const text = dialogue.trim();
    if (!text) return;
    const elapsed =
      sessionStartRef.current != null
        ? formatElapsed(Date.now() - sessionStartRef.current)
        : new Date().toISOString();
    setTurns((prev) => [
      ...prev,
      { speaker, timestamp: elapsed, dialogue: text },
    ]);
  }, []);

  const runScan = useCallback(async () => {
    const text = formatTurns(turnsRef.current).trim();
    if (text.length < 40 || apiOnline === false) return;
    setScanning(true);
    setError(null);
    try {
      const result = await scanLiveObjections(text, objectionsRef.current);
      setObjections((prev) => mergeScanResults(prev, result));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live scan failed");
    } finally {
      setScanning(false);
    }
  }, [apiOnline]);

  useEffect(() => {
    if (phase !== "live" || !autoScan) return;
    const id = window.setInterval(() => {
      void runScan();
    }, 22000);
    return () => window.clearInterval(id);
  }, [phase, autoScan, runScan]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Live captions need Chrome or Edge. Paste notes below instead.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      let chunk = "";
      for (let i = 0; i < event.results.length; i++) {
        chunk += event.results[i].transcript;
      }
      if (chunk.trim()) {
        appendTurn("Rep", chunk.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") {
        setError(`Speech capture: ${e.error}`);
      }
      setListening(false);
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setError(null);
  }, [appendTurn]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startSession = async () => {
    if (!platform) {
      setError("Link Zoom, Meet, or Teams first.");
      return;
    }
    setPhase("live");
    setTurns([]);
    setObjections([]);
    sessionStartRef.current = Date.now();
    setError(null);
    setPanelMinimized(false);
    setZoomStreamActive(false);
    zoomUnsubRef.current?.();
    zoomUnsubRef.current = null;

    if (platform === "zoom" && zoomStatus?.connected) {
      try {
        const { sessionId } = await startZoomLiveSession();
        zoomSessionIdRef.current = sessionId;
        zoomUnsubRef.current = subscribeZoomTranscriptStream(
          sessionId,
          (chunk) => appendTurn(chunk.speaker, chunk.dialogue),
          (msg) => setError(msg)
        );
        setZoomStreamActive(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Zoom live session failed — using mic fallback.");
      }
    }

    startListening();
  };

  const endSession = () => {
    stopListening();
    zoomUnsubRef.current?.();
    zoomUnsubRef.current = null;
    zoomSessionIdRef.current = null;
    setZoomStreamActive(false);
    setPhase("idle");
    sessionStartRef.current = null;
    const formatted = formatTurns(turns);
    onLiveUpdate?.({
      active: false,
      platform,
      turns,
      objections,
    });
    onEndSession(turns, formatted, objections);
  };

  const addNote = () => {
    const line = noteInput.trim();
    if (!line) return;
    const { speaker, dialogue } = parseNoteLine(line);
    appendTurn(speaker, dialogue);
    setNoteInput("");
  };

  const addManualObjection = () => {
    const text = manualObjection.trim();
    if (!text) return;
    setObjections((prev) => [...prev, createObjection(text, "manual")]);
    setManualObjection("");
  };

  const markAnswered = (id: string) => {
    setObjections((prev) =>
      prev.map((o) =>
        o.id === id ? { ...o, status: "answered", answeredAt: new Date().toISOString() } : o
      )
    );
  };

  const dismissObjection = (id: string) => {
    setObjections((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "dismissed" } : o))
    );
  };

  const open = openObjections(objections);
  const answered = objections.filter((o) => o.status === "answered");

  return (
    <div className="meeting-companion">
      <p className="console-tab-hint">
        Float the live panel in the corner during Zoom, Meet, or Teams. Track objections as they
        land — check them off or let Lazarus Deal Recovery auto-clear when the buyer answers. End the session for
        a full post-call score on the same deal.
      </p>

      <div className="meeting-platform-row">
        {MEETING_PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`meeting-platform-btn${platform === p.id ? " meeting-platform-btn-active" : ""}`}
            onClick={() => {
              setPlatform(p.id);
              setLinkedPlatform(p.id);
            }}
          >
            {p.label}
            {platform === p.id && <span className="meeting-platform-linked">Linked</span>}
          </button>
        ))}
      </div>
      {platform && (
        <p className="meeting-platform-note">
          {MEETING_PLATFORMS.find((p) => p.id === platform)?.connectNote}
        </p>
      )}

      {platform === "zoom" && (
        <div className="meeting-platform-connect">
          {zoomStatus?.connected ? (
            <p className="meeting-platform-connected">
              Zoom connected{zoomStatus.account_email ? ` · ${zoomStatus.account_email}` : ""}.
              {zoomStatus.rtms_supported
                ? " Start a session, join your meeting, and RTMS transcripts will stream in."
                : " RTMS runs on Render (Linux) — local dev uses mic/paste until deployed."}
            </p>
          ) : (
            <>
              <p className="meeting-platform-disconnected">
                Connect Zoom for live meeting transcripts (RTMS). Mic + paste works without OAuth.
              </p>
              <a className="btn-primary meeting-platform-connect-btn" href={zoomConnectUrl()}>
                Connect Zoom
              </a>
            </>
          )}
        </div>
      )}

      {platform === "meet" && (
        <div className="meeting-platform-connect">
          {googleStatus?.connected ? (
            <p className="meeting-platform-connected">
              Google connected
              {googleStatus.account_email ? ` · ${googleStatus.account_email}` : ""}. Mic + paste
              feeds the live Recovery Brief today; Meet caption ingest comes next.
            </p>
          ) : (
            <>
              <p className="meeting-platform-disconnected">
                Connect Google for Meet/Workspace. Until auto-ingest ships, start a live session and
                use mic + paste beside Meet — same Recovery Brief pipe.
              </p>
              <a
                className="btn-primary meeting-platform-connect-btn"
                href={googleMeetConnectUrl()}
              >
                Connect Google Meet
              </a>
            </>
          )}
        </div>
      )}

      {platform === "teams" && (
        <div className="meeting-platform-connect">
          {teamsStatus?.connected ? (
            <p className="meeting-platform-connected">
              Teams connected
              {teamsStatus.account_email ? ` · ${teamsStatus.account_email}` : ""}. Mic + paste feeds
              the live Recovery Brief today; Graph transcript pull comes next.
            </p>
          ) : (
            <>
              <p className="meeting-platform-disconnected">
                Connect Microsoft Teams (Entra ID). Until Graph transcript pull ships, start a live
                session and use mic + paste beside Teams — same Recovery Brief pipe.
              </p>
              <a className="btn-primary meeting-platform-connect-btn" href={teamsConnectUrl()}>
                Connect Microsoft Teams
              </a>
            </>
          )}
        </div>
      )}

      {phase === "idle" ? (
        <div className="meeting-session-idle">
          <button
            type="button"
            className="btn-primary meeting-start-btn"
            disabled={!platform || apiOnline === false}
            onClick={startSession}
          >
            Start live session
          </button>
          {apiOnline === false && (
            <p className="meeting-session-warn">API offline — start the server to scan objections live.</p>
          )}
        </div>
      ) : (
        <div className="meeting-session-controls">
          <span className="meeting-live-pill">● LIVE · {platform?.toUpperCase()}</span>
          {platform === "zoom" && zoomStreamActive && (
            <span className="meeting-live-pill meeting-zoom-rtms-pill">RTMS stream</span>
          )}
          <button type="button" className="file-clear-btn" onClick={() => void runScan()} disabled={scanning}>
            {scanning ? "Scanning…" : "Scan now"}
          </button>
          <label className="meeting-auto-scan">
            <input type="checkbox" checked={autoScan} onChange={(e) => setAutoScan(e.target.checked)} />
            Auto-scan every 22s
          </label>
          <button type="button" className="field-capture-stop meeting-end-btn" onClick={endSession}>
            End &amp; run post-call analysis
          </button>
        </div>
      )}

      <div className="input-group">
        <label htmlFor="live-note">Live notes (paste buyer lines as you hear them)</label>
        <div className="meeting-note-row">
          <input
            id="live-note"
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="e.g. Buyer: We need DPA before procurement…"
            disabled={phase !== "live"}
          />
          <button type="button" className="btn-primary" onClick={addNote} disabled={phase !== "live"}>
            Add
          </button>
        </div>
      </div>

      <div className="input-group">
        <label htmlFor="manual-objection">Add objection manually</label>
        <div className="meeting-note-row">
          <input
            id="manual-objection"
            type="text"
            value={manualObjection}
            onChange={(e) => setManualObjection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManualObjection()}
            placeholder="Budget not approved until Q3"
          />
          <button type="button" className="btn-primary" onClick={addManualObjection}>
            Track
          </button>
        </div>
      </div>

      {transcript && (
        <details className="meeting-transcript-preview">
          <summary>Live transcript ({turns.length} turns)</summary>
          <pre>{transcript.slice(-2000)}</pre>
        </details>
      )}

      {error && <div className="error-banner">{error}</div>}

      {phase === "live" && (
        <div
          className={`live-objection-panel${panelMinimized ? " live-objection-panel-min" : ""}`}
          role="complementary"
          aria-label="Live objection tracker"
        >
          <header className="live-objection-panel-header">
            <span className="live-objection-panel-title">Live objections</span>
            <span className="live-objection-panel-meta">
              {open.length} open · Deal ${dealValue}
            </span>
            <button
              type="button"
              className="live-objection-panel-toggle"
              onClick={() => setPanelMinimized((m) => !m)}
            >
              {panelMinimized ? "Expand" : "Minimize"}
            </button>
          </header>
          {!panelMinimized && (
            <div className="live-objection-panel-body">
              {listening && (
                <p className="live-objection-listening">Mic capture on — speak or paste notes</p>
              )}
              {open.length === 0 && answered.length === 0 && (
                <p className="live-objection-empty">No objections yet. They will appear as the call unfolds.</p>
              )}
              <ul className="live-objection-list">
                {open.map((o) => (
                  <li key={o.id} className="live-objection-item live-objection-open">
                    <div className="live-objection-text">
                      <strong>{o.text}</strong>
                      {o.evidence && <span className="live-objection-evidence">&ldquo;{o.evidence}&rdquo;</span>}
                    </div>
                    <div className="live-objection-actions">
                      <button type="button" onClick={() => markAnswered(o.id)} title="Mark answered">
                        ✓
                      </button>
                      <button type="button" onClick={() => dismissObjection(o.id)} title="Dismiss">
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {answered.length > 0 && (
                <div className="live-objection-answered-block">
                  <span className="live-objection-answered-label">Cleared ({answered.length})</span>
                  <ul className="live-objection-list live-objection-answered-list">
                    {answered.slice(-4).map((o) => (
                      <li key={o.id} className="live-objection-item live-objection-answered">
                        {o.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
