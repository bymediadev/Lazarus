import { useCallback, useEffect, useMemo, useState } from "react";
import AnalysisReport from "./components/AnalysisReport";
import DealProfilePanel, { parseHistoricalCrmJson } from "./components/DealProfilePanel";
import MeetingCompanion from "./components/MeetingCompanion";
import FieldRecorder from "./components/FieldRecorder";
import CaptureStack from "./components/CaptureStack";
import EnterpriseTrust, { HeroTrustBanner } from "./components/EnterpriseTrust";
import SiteFooter from "./components/SiteFooter";
import TrustPackLink from "./components/TrustPackLink";
import TrustPackModal from "./components/TrustPackModal";
import { TRUST_PACK_NAV, TRUST_PACK_OPEN_EVENT, type TrustPackSlug } from "./lib/trustPack";
import { API_BASE, apiTargetLabel, runPostMortem } from "./lib/api";
import {
  listPendingAnalyses,
  queuePendingAnalysis,
  removePendingAnalysis,
  assembleSessionBlob,
  clearSessionChunks,
} from "./lib/offlineRecording";
import { normalizeResult, PostMortemResult, type HistoricalCrmContextEntry, type LiveTranscriptTurn } from "./types";
import type { LiveObjection } from "./lib/liveObjections";
import { setLinkedPlatform } from "./lib/meetingPlatforms";

const ACCEPTED_EXT = [".mp3", ".wav", ".mp4", ".m4a", ".webm", ".mpeg", ".mpga"];
const ACCEPT_ATTR = ".mp3,.wav,.mp4,.m4a,.webm,audio/*,video/mp4,video/webm";

type InputTab = "call" | "email" | "field" | "live";

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAcceptedFile(file: File): boolean {
  const ext = getExtension(file.name);
  if (ACCEPTED_EXT.includes(ext)) return true;
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  return false;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<InputTab>("call");
  const [file, setFile] = useState<File | null>(null);
  const [recordingSource, setRecordingSource] = useState<"upload" | "field" | null>(null);
  const [fieldSessionId, setFieldSessionId] = useState<string | null>(null);
  const [dealValue, setDealValue] = useState("52000");
  const [accountId, setAccountId] = useState("");
  const [salesCycleDays, setSalesCycleDays] = useState("");
  const [historicalCrmJson, setHistoricalCrmJson] = useState("");
  const [historicalParseError, setHistoricalParseError] = useState<string | null>(null);
  const [liveTranscriptPayload, setLiveTranscriptPayload] = useState<LiveTranscriptTurn[]>([]);
  const [liveSessionObjections, setLiveSessionObjections] = useState<
    { text: string; status: string; source: string }[]
  >([]);
  const [callTranscript, setCallTranscript] = useState("");
  const [emailThread, setEmailThread] = useState("");
  const [result, setResult] = useState<PostMortemResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [trustPack, setTrustPack] = useState<TrustPackSlug | null>(null);

  const hasAudio = !!file;
  const hasCallTranscript = callTranscript.trim().length > 0;
  const hasEmail = emailThread.trim().length > 0;
  const hasFieldRecording = recordingSource === "field" && hasAudio;
  const hasCallInput = hasAudio || hasCallTranscript;
  const channelCount = [hasCallInput, hasEmail, hasFieldRecording].filter(Boolean).length;
  const hasAnyInput = hasCallInput || hasEmail;

  const loadingMessage = useMemo(() => {
    if (channelCount >= 2) return "Stitching cross-channel context into intelligence brief...";
    if (hasAudio) return "Transcribing audio and building intelligence brief...";
    if (hasEmail) return "Parsing email thread and building intelligence brief...";
    return "Analyzing deal and building intelligence brief...";
  }, [channelCount, hasAudio, hasEmail]);

  const headerStatus = loading
    ? "INTELLIGENCE BRIEF IN PROGRESS..."
    : result
      ? "INTELLIGENCE BRIEF READY"
      : "STANDBY";

  const runAnalysis = useCallback(
    async (payload: {
      file?: File | null;
      transcript: string;
      emailThread: string;
      dealValue: string;
      fieldCapture?: boolean;
      accountId?: string;
      salesCycleDays?: number;
      historicalCrmContext?: HistoricalCrmContextEntry[] | null;
      liveTranscriptPayload?: LiveTranscriptTurn[];
      liveSessionObjections?: { text: string; status: string; source: string }[];
    }) => {
      const data = await runPostMortem({
        file: payload.file,
        transcript: payload.transcript,
        emailThread: payload.emailThread,
        dealValue: payload.dealValue,
        fieldCapture: payload.fieldCapture,
        accountId: payload.accountId,
        salesCycleDays: payload.salesCycleDays,
        historicalCrmContext: payload.historicalCrmContext ?? undefined,
        liveTranscriptPayload: payload.liveTranscriptPayload,
        liveSessionObjections: payload.liveSessionObjections,
      });
      setResult(normalizeResult({ ...data, sources: data.sources, processed_at: data.processed_at }));
      setWarnings(data.warnings ?? []);
    },
    []
  );

  const drainPendingQueue = useCallback(async () => {
    if (!navigator.onLine || apiOnline === false) return;
    const pending = await listPendingAnalyses();
    if (!pending.length) return;

    setSyncNotice(`Syncing ${pending.length} offline capture(s)...`);
    let failures = 0;
    for (const entry of pending) {
      try {
        let file: File | null = null;
        if (entry.recordingSessionId) {
          const blob = await assembleSessionBlob(entry.recordingSessionId, "audio/webm");
          if (blob) {
            file = new File([blob], `field-sync-${entry.id}.webm`, { type: "audio/webm" });
          }
        }
        await runAnalysis({
          file,
          transcript: entry.transcript,
          emailThread: entry.emailThread,
          dealValue: entry.dealValue,
          fieldCapture: !!entry.recordingSessionId,
        });
        if (entry.recordingSessionId) {
          await clearSessionChunks(entry.recordingSessionId);
        }
        await removePendingAnalysis(entry.id);
      } catch {
        failures++;
        continue;
      }
    }
    if (failures > 0) {
      setSyncNotice(
        `${pending.length - failures} of ${pending.length} synced — ${failures} failed and will retry when online.`
      );
    } else {
      setSyncNotice(null);
    }
  }, [apiOnline, runAnalysis]);

  useEffect(() => {
    const check = () => {
      fetch(`${API_BASE}/api/health`)
        .then((r) => setApiOnline(r.ok))
        .catch(() => setApiOnline(false));
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setTrustPack((e as CustomEvent<TrustPackSlug>).detail);
    };
    window.addEventListener(TRUST_PACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TRUST_PACK_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      drainPendingQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainPendingQueue]);

  const handleFieldRecordingReady = useCallback((f: File, sessionId: string) => {
    setFile(f);
    setFieldSessionId(sessionId);
    setRecordingSource("field");
    setError(null);
  }, []);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError("Unsupported file type. Use .mp3, .wav, .mp4, or .m4a.");
      return;
    }
    setError(null);
    setFile(f);
    setRecordingSource("upload");
    setActiveTab("call");
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const handleRun = async () => {
    if (!hasAnyInput) {
      setError("Add a call recording, transcript, email thread, or any combination.");
      return;
    }

    const historicalCrmContext = parseHistoricalCrmJson(historicalCrmJson);
    if (historicalCrmJson.trim() && historicalCrmContext === null) {
      setError("Historical CRM context must be valid JSON array.");
      return;
    }

    const cycleDaysRaw = parseInt(salesCycleDays, 10);
    const salesCycleDaysNum =
      Number.isFinite(cycleDaysRaw) && cycleDaysRaw > 0 ? cycleDaysRaw : undefined;

    const offline = !navigator.onLine || apiOnline === false;

    if (offline) {
      await queuePendingAnalysis({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        dealValue,
        transcript: callTranscript,
        emailThread,
        recordingSessionId: fieldSessionId ?? undefined,
      });
      // Clear all input state so the user cannot double-submit and badges reset
      setFile(null);
      setCallTranscript("");
      setEmailThread("");
      setFieldSessionId(null);
      setRecordingSource(null);
      setSyncNotice("Analysis queued — will auto-sync when connection restores.");
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      await runAnalysis({
        file,
        transcript: callTranscript,
        emailThread,
        dealValue,
        fieldCapture: recordingSource === "field",
        accountId: accountId.trim() || undefined,
        salesCycleDays: salesCycleDaysNum,
        historicalCrmContext,
        liveTranscriptPayload: liveTranscriptPayload.length ? liveTranscriptPayload : undefined,
        liveSessionObjections: liveSessionObjections.length ? liveSessionObjections : undefined,
      });
      if (fieldSessionId) {
        await clearSessionChunks(fieldSessionId);
        setFieldSessionId(null);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          API_BASE
            ? `Cannot reach Railway API (${apiTargetLabel()}). Check the URL and CORS settings.`
            : "Cannot reach API server. Run npm run dev and try again."
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: InputTab; label: string; dot?: boolean }[] = [
    { id: "call", label: "Call Auto-Autopsy", dot: hasCallInput },
    { id: "live", label: "Live Meeting", dot: false },
    { id: "email", label: "Email Thread", dot: hasEmail },
    { id: "field", label: "🎙️ Field Capture", dot: hasFieldRecording },
  ];

  const handleLiveSessionEnd = useCallback(
    (
      turns: LiveTranscriptTurn[],
      formattedTranscript: string,
      objections: LiveObjection[]
    ) => {
      if (!turns.length && !formattedTranscript.trim()) return;

      if (turns.length) {
        setLiveTranscriptPayload(turns);
      }
      if (objections.length) {
        setLiveSessionObjections(
          objections.map((o) => ({
            text: o.text,
            status: o.status,
            source: o.source,
          }))
        );
      }

      const text = formattedTranscript.trim();
      if (text) {
        setCallTranscript((prev) =>
          prev.trim() ? `${prev}\n\n--- LIVE SESSION ---\n${text}` : text
        );
      }
      setActiveTab("call");
      setError(null);
    },
    []
  );

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="Lazarus Deal Resuscitation" className="header-logo" />
          <h1>Lazarus</h1>
          <span className="tag">Deal Judgment Layer</span>
        </div>
        <span className="header-status">
          {headerStatus}
          {apiOnline === false &&
            (API_BASE
              ? ` · API OFFLINE (${apiTargetLabel()})`
              : " · API OFFLINE — run npm run dev")}
          {apiOnline === true && API_BASE && ` · API: ${apiTargetLabel()}`}
        </span>
      </header>

      <div className="app-main">
        <HeroTrustBanner />
        <CaptureStack
          onOpenLiveTab={(platform) => {
            if (platform) setLinkedPlatform(platform);
            setActiveTab("live");
          }}
        />

        <div className="workspace">
          <section className="panel panel-left intake-viewport">
            <div className="panel-label">Deal Intake — upload or paste from any recorder</div>

            <DealProfilePanel
              accountId={accountId}
              salesCycleDays={salesCycleDays}
              historicalJson={historicalCrmJson}
              onAccountIdChange={setAccountId}
              onSalesCycleDaysChange={setSalesCycleDays}
              onHistoricalJsonChange={setHistoricalCrmJson}
              onParseError={setHistoricalParseError}
            />

            <div className="console-tabs" role="tablist" aria-label="Input modes">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`console-tab${activeTab === tab.id ? " console-tab-active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.dot && <span className="console-tab-dot" aria-label="Has content" />}
                </button>
              ))}
            </div>

            <div className="console-tab-panel" role="tabpanel">
              {activeTab === "call" && (
                <div className="console-tab-audio">
                  <p className="console-tab-hint">
                    Drop a recording or paste a transcript from Zoom, Meet, Teams, Gong, or anywhere
                    else. Stitches with Email Thread and Field Capture before analysis.
                  </p>
                  <div
                    className={`dropzone dropzone-tab ${dragOver ? "drag-over" : ""} ${file && recordingSource === "upload" ? "has-file" : ""}`}
                  >
                    <input
                      id="recording-upload"
                      className="dropzone-file-input"
                      type="file"
                      accept={ACCEPT_ATTR}
                      onDragEnter={onDragEnter}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onChange={(e) => {
                        handleFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <div className="dropzone-content">
                      <span className="dropzone-icon">
                        {file && recordingSource === "upload" ? "✓" : "⬡"}
                      </span>
                      <span className="dropzone-text">
                        {file && recordingSource === "upload"
                          ? "Recording loaded — ready for analysis"
                          : "Drop Call Recording (.mp3 / .wav / .mp4)"}
                      </span>
                      {file && recordingSource === "upload" && (
                        <>
                          <span className="dropzone-filename">{file.name}</span>
                          <span className="dropzone-meta">{formatFileSize(file.size)}</span>
                        </>
                      )}
                      {!(file && recordingSource === "upload") && (
                        <span className="dropzone-hint">Click or drag a file here</span>
                      )}
                    </div>
                  </div>
                  {file && recordingSource === "upload" && (
                    <button
                      type="button"
                      className="file-clear-btn"
                      onClick={() => {
                        setFile(null);
                        setRecordingSource(null);
                      }}
                    >
                      Remove recording
                    </button>
                  )}
                  <div className="input-group" style={{ marginTop: "1rem" }}>
                    <label htmlFor="deal-value">Estimated Deal Value ($)</label>
                    <input
                      id="deal-value"
                      type="number"
                      min="0"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="52000"
                    />
                  </div>
                  <div className="input-group input-group-grow">
                    <label htmlFor="call-transcript">Call Transcript</label>
                    <textarea
                      id="call-transcript"
                      className="transcript-textarea"
                      value={callTranscript}
                      onChange={(e) => setCallTranscript(e.target.value)}
                      placeholder="Paste call transcript or meeting notes..."
                    />
                  </div>
                </div>
              )}

              {activeTab === "email" && (
                <div className="console-tab-transcript">
                  <p className="console-tab-hint">
                    Paste stalled email history. Chronologically stitched with call and field inputs.
                  </p>
                  <div className="input-group input-group-grow">
                    <label htmlFor="email-thread">Paste Stalled Email History Thread</label>
                    <textarea
                      id="email-thread"
                      className="transcript-textarea"
                      value={emailThread}
                      onChange={(e) => setEmailThread(e.target.value)}
                      placeholder="Paste forwarded email chain, reply threads, or CRM email export..."
                    />
                  </div>
                </div>
              )}

              {activeTab === "live" && (
                <MeetingCompanion
                  dealValue={dealValue}
                  apiOnline={apiOnline}
                  onEndSession={handleLiveSessionEnd}
                />
              )}

              {activeTab === "field" && (
                <FieldRecorder
                  hasRecording={hasFieldRecording}
                  onRecordingReady={handleFieldRecordingReady}
                  onClear={() => {
                    if (recordingSource === "field") {
                      if (fieldSessionId) clearSessionChunks(fieldSessionId);
                      setFile(null);
                      setRecordingSource(null);
                      setFieldSessionId(null);
                    }
                  }}
                />
              )}
            </div>

            {hasAnyInput && (
              <div className="input-badges">
                {hasAudio && recordingSource === "upload" && (
                  <span className="input-badge input-badge-audio">Call recording loaded</span>
                )}
                {hasCallTranscript && (
                  <span className="input-badge input-badge-text">Call transcript attached</span>
                )}
                {hasEmail && (
                  <span className="input-badge input-badge-email">Email thread attached</span>
                )}
                {hasFieldRecording && (
                  <span className="input-badge input-badge-field">Field capture attached</span>
                )}
                {channelCount >= 2 && (
                  <span className="input-badge input-badge-merge">Cross-channel stitch ready</span>
                )}
                {liveTranscriptPayload.length > 0 && (
                  <span className="input-badge input-badge-text">
                    Live session ({liveTranscriptPayload.length} turns)
                  </span>
                )}
                {liveSessionObjections.length > 0 && (
                  <span className="input-badge input-badge-email">
                    {liveSessionObjections.length} live objection(s)
                  </span>
                )}
              </div>
            )}

            <button className="run-button" onClick={handleRun} disabled={loading}>
              {loading ? "Running Analysis..." : "Run Deal Analysis"}
            </button>
            <div className="privacy-trust-banner" role="status">
              <span className="privacy-trust-icon" aria-hidden="true">
                🛡️
              </span>
              <span className="privacy-trust-text">
                Privacy sandbox active · 30-day transcript purge · deal scores retained for the cycle
              </span>
            </div>
            <p className="upload-consent">
              By running analysis, you confirm you have the legal right to upload this content.{" "}
              {TRUST_PACK_NAV.filter((l) => l.slug === "terms" || l.slug === "privacy").map(
                ({ slug, label }, i) => (
                  <span key={slug}>
                    {i > 0 && " · "}
                    <TrustPackLink slug={slug}>{label}</TrustPackLink>
                  </span>
                )
              )}
            </p>

            {syncNotice && <div className="warning-banner"><p>{syncNotice}</p></div>}

            {warnings.length > 0 && (
              <div className="warning-banner">
                {warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {error && <div className="error-banner">{error}</div>}
            {historicalParseError && !error && (
              <div className="error-banner">{historicalParseError}</div>
            )}
          </section>

          <section className="panel panel-right">
            <div className="panel-label">Deal Score &amp; Recovery Brief</div>

            {loading ? (
              <div className="loading-overlay">
                <div className="spinner" />
                <span>{loadingMessage}</span>
              </div>
            ) : result ? (
              <AnalysisReport result={result} sources={result.sources} />
            ) : (
              <div className="empty-state">
                <span>AWAITING INPUT</span>
                <span>Drop a call, email, or field note to score the deal</span>
              </div>
            )}
          </section>
        </div>

        <EnterpriseTrust />
      </div>

      <SiteFooter />

      {trustPack && <TrustPackModal slug={trustPack} onClose={() => setTrustPack(null)} />}
    </div>
  );
}
