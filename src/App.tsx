import { useCallback, useEffect, useMemo, useState } from "react";
import AnalysisReport from "./components/AnalysisReport";
import PipelineLeakCalculator from "./components/PipelineLeakCalculator";
import EnterpriseTrust, { HeroTrustBanner } from "./components/EnterpriseTrust";
import SiteFooter from "./components/SiteFooter";
import { API_BASE, apiTargetLabel, runPostMortem } from "./lib/api";
import { normalizeResult, PostMortemResult } from "./types";

const ACCEPTED_EXT = [".mp3", ".wav", ".mp4", ".m4a", ".webm", ".mpeg", ".mpga"];
const ACCEPT_ATTR = ".mp3,.wav,.mp4,.m4a,.webm,audio/*,video/mp4,video/webm";

type InputTab = "calculator" | "audio" | "transcript";

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
  const [activeTab, setActiveTab] = useState<InputTab>("transcript");
  const [file, setFile] = useState<File | null>(null);
  const [dealValue, setDealValue] = useState("52000");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<PostMortemResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const hasAudio = !!file;
  const hasTranscript = transcript.trim().length > 0;
  const hasDualInput = hasAudio && hasTranscript;

  const loadingMessage = useMemo(() => {
    if (hasDualInput) return "Transcribing audio and building intelligence brief...";
    if (hasAudio) return "Listening to recording and building intelligence brief...";
    return "Analyzing deal and building intelligence brief...";
  }, [hasAudio, hasDualInput]);

  const headerStatus = loading
    ? "INTELLIGENCE BRIEF IN PROGRESS..."
    : result
      ? "INTELLIGENCE BRIEF READY"
      : "STANDBY";

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

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError("Unsupported file type. Use .mp3, .wav, .mp4, or .m4a.");
      return;
    }
    setError(null);
    setFile(f);
    setActiveTab("audio");
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
    if (!hasAudio && !hasTranscript) {
      setError("Add a recording, a transcript, or both.");
      return;
    }

    if (apiOnline === false) {
      setError(
        API_BASE
          ? `Cannot reach Railway API (${apiTargetLabel()}). Check VITE_API_URL and FRONTEND_ORIGIN on Railway.`
          : "API server is offline. Run npm run dev in the Lazarus folder and try again."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const data = await runPostMortem({ file, transcript, dealValue });
      setResult(normalizeResult(data));
      setWarnings(data.warnings ?? []);
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
    { id: "calculator", label: "Pipeline Calculator" },
    { id: "audio", label: "Audio Upload", dot: hasAudio },
    { id: "transcript", label: "Transcript", dot: hasTranscript },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="Lazarus Deal Resuscitation" className="header-logo" />
          <h1>Lazarus</h1>
          <span className="tag">Deal Rescue Console</span>
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

        <div className="workspace">
          <section className="panel panel-left">
            <div className="panel-label">Input Console</div>

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
              {activeTab === "calculator" && <PipelineLeakCalculator embedded />}

              {activeTab === "audio" && (
                <div className="console-tab-audio">
                  <p className="console-tab-hint">
                    Upload a call recording. Lazarus transcribes via AssemblyAI, then runs the
                    deterministic autopsy engine.
                  </p>
                  <div
                    className={`dropzone dropzone-tab ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}
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
                      <span className="dropzone-icon">{file ? "✓" : "⬡"}</span>
                      <span className="dropzone-text">
                        {file
                          ? "Recording loaded — ready for analysis"
                          : "Drop Call Recording (.mp3 / .wav / .mp4)"}
                      </span>
                      {file && (
                        <>
                          <span className="dropzone-filename">{file.name}</span>
                          <span className="dropzone-meta">{formatFileSize(file.size)}</span>
                        </>
                      )}
                      {!file && (
                        <span className="dropzone-hint">Click or drag a file here</span>
                      )}
                    </div>
                  </div>
                  {file && (
                    <button type="button" className="file-clear-btn" onClick={() => setFile(null)}>
                      Remove recording
                    </button>
                  )}
                </div>
              )}

              {activeTab === "transcript" && (
                <div className="console-tab-transcript">
                  <p className="console-tab-hint">
                    Paste the call transcript or meeting notes. Outcome is inferred from dialogue —
                    do not label deal status yourself.
                  </p>
                  <div className="input-group">
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
                    <label htmlFor="transcript">Call Transcript &amp; Notes</label>
                    <textarea
                      id="transcript"
                      className="transcript-textarea"
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Paste call transcript, email thread, or meeting notes..."
                    />
                  </div>
                </div>
              )}
            </div>

            {(hasAudio || hasTranscript) && (
              <div className="input-badges">
                {hasAudio && (
                  <span className="input-badge input-badge-audio">Recording loaded</span>
                )}
                {hasTranscript && (
                  <span className="input-badge input-badge-text">Transcript attached</span>
                )}
                {hasDualInput && (
                  <span className="input-badge input-badge-merge">Dual-source merge enabled</span>
                )}
              </div>
            )}

            {activeTab !== "calculator" && (
              <button className="run-button" onClick={handleRun} disabled={loading}>
                {loading ? "Running Analysis..." : "Run Deal Analysis"}
              </button>
            )}

            {warnings.length > 0 && (
              <div className="warning-banner">
                {warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {error && <div className="error-banner">{error}</div>}
          </section>

          <section className="panel panel-right">
            <div className="panel-label">Revenue Intelligence Output</div>

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
                <span>Use Audio or Transcript tabs, then run analysis</span>
              </div>
            )}
          </section>
        </div>

        <EnterpriseTrust />
      </div>

      <SiteFooter />
    </div>
  );
}
