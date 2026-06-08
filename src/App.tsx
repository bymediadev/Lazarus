import { useCallback, useEffect, useMemo, useState } from "react";
import { runPostMortem } from "./lib/api";
import {
  DEAL_STATUS_UI,
  MOCK_POST_MORTEM,
  NEUTRAL_UI,
  normalizeResult,
  PostMortemResult,
} from "./types";

const ACCEPTED_EXT = [".mp3", ".wav", ".mp4", ".m4a", ".webm", ".mpeg", ".mpga"];
const ACCEPT_ATTR = ".mp3,.wav,.mp4,.m4a,.webm,audio/*,video/mp4,video/webm";

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
  const [file, setFile] = useState<File | null>(null);
  const [dealValue, setDealValue] = useState("52000");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<PostMortemResult | null>(MOCK_POST_MORTEM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const hasAudio = !!file;
  const hasTranscript = transcript.trim().length > 0;
  const hasDualInput = hasAudio && hasTranscript;

  const loadingMessage = useMemo(() => {
    if (hasDualInput) return "Transcribing audio and reading between the lines...";
    if (hasAudio) return "Listening to recording and analyzing the call...";
    return "Reading transcript and analyzing the call...";
  }, [hasAudio, hasDualInput]);

  const statusUi = result ? DEAL_STATUS_UI[result.deal_status] : null;
  const headerStatus = loading
    ? statusUi?.headerLoading ?? NEUTRAL_UI.headerLoading
    : result
      ? statusUi?.headerComplete ?? NEUTRAL_UI.headerComplete
      : "STANDBY";
  const outputLabel = statusUi?.outputPanelLabel ?? NEUTRAL_UI.outputPanelLabel;

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/health`)
      .then((r) => r.ok && setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!isAcceptedFile(f)) {
      setError("Unsupported file type. Use .mp3, .wav, .mp4, or .m4a.");
      return;
    }
    setError(null);
    setFile(f);
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

    setLoading(true);
    setError(null);
    setWarnings([]);

    try {
      const data = await runPostMortem({
        file,
        transcript,
        dealValue,
      });
      setResult(normalizeResult(data));
      setWarnings(data.warnings ?? []);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Cannot reach API server. Run npm run dev and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyActionItems = async () => {
    if (!result) return;
    const items = result.action_plan;
    const text = items.map((item, i) => `${i + 1}. ${item}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>Lazarus</h1>
          <span className="tag">Deal Rescue Console</span>
        </div>
        <span className="header-status">
          {headerStatus}
          {apiOnline === false && " · API OFFLINE"}
        </span>
      </header>

      <div className="workspace">
        <section className="panel panel-left">
          <div className="panel-label">Input Log</div>

          {(hasAudio || hasTranscript) && (
            <div className="input-badges">
              {hasAudio && <span className="input-badge input-badge-audio">Recording loaded</span>}
              {hasTranscript && (
                <span className="input-badge input-badge-text">Transcript attached</span>
              )}
              {hasDualInput && (
                <span className="input-badge input-badge-merge">Dual-source merge enabled</span>
              )}
            </div>
          )}

          <div className={`dropzone ${dragOver ? "drag-over" : ""} ${file ? "has-file" : ""}`}>
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
                  : "Drop Call Recording (.mp3/.wav/.mp4)"}
              </span>
              {file && (
                <>
                  <span className="dropzone-filename">{file.name}</span>
                  <span className="dropzone-meta">{formatFileSize(file.size)}</span>
                </>
              )}
              {!file && <span className="dropzone-hint">Click or drag a file here</span>}
            </div>
          </div>

          {file && (
            <button type="button" className="file-clear-btn" onClick={() => setFile(null)}>
              Remove recording
            </button>
          )}

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

          <div className="or-divider">— PLUS OPTIONAL TRANSCRIPT / CONTEXT —</div>

          <div className="input-group">
            <label htmlFor="transcript">
              Call Transcript &amp; Notes
              <span className="label-hint">
                Optional. Combined with a recording when both are available. Outcome is inferred from the conversation — do not label the deal status yourself.
              </span>
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste call transcript, email thread, or meeting notes — Lazarus infers deal status from what was said"
            />
          </div>

          <button className="run-button" onClick={handleRun} disabled={loading}>
            {loading ? "Running Analysis..." : "Run Deal Analysis"}
          </button>

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
          <div className="panel-label">{outputLabel}</div>

          {loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>{loadingMessage}</span>
            </div>
          ) : result && statusUi ? (
            <div className="cards">
              <div className={`deal-status-banner ${statusUi.tagClass}`}>
                <span className="deal-status-mode">{statusUi.mode}</span>
                <span className="deal-status-label">{statusUi.label}</span>
                {result.client_name && (
                  <span className="deal-status-client">{result.client_name}</span>
                )}
              </div>

              {result.sources && (
                <div className="sources-bar">
                  {result.sources.audio && <span>Audio transcribed</span>}
                  {result.sources.manual && <span>Manual notes merged</span>}
                  {result.sources.audio && result.sources.manual && (
                    <span className="sources-merged">Combined analysis</span>
                  )}
                </div>
              )}

              <article className={`card card-${statusUi.card1.border}`}>
                <h2 className="card-title">{statusUi.card1.title}</h2>
                <div className="card-body">
                  <p>{result.headline}</p>
                </div>
              </article>

              <article className={`card card-${statusUi.card2.border}`}>
                <h2 className="card-title">{statusUi.card2.title}</h2>
                <div className="card-body">
                  <p>{result.diagnosis}</p>
                </div>
              </article>

              <article className={`card card-${statusUi.card3.border}`}>
                <h2 className="card-title">{statusUi.card3.title}</h2>
                <div className="card-body">
                  <ul className="restart-list">
                    {result.action_plan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <button
                    className={`copy-button ${copied ? "copied" : ""}`}
                    onClick={copyActionItems}
                  >
                    {copied ? "Copied!" : statusUi.card3.copyLabel}
                  </button>
                </div>
              </article>
            </div>
          ) : (
            <div className="empty-state">
              <span>AWAITING INPUT</span>
              <span>Drop a recording, paste a transcript, or use both</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
