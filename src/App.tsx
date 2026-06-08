import { useCallback, useEffect, useMemo, useState } from "react";
import { runPostMortem } from "./lib/api";
import { MOCK_POST_MORTEM, PostMortemResult } from "./types";

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
  const [copied, setCopied] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const hasAudio = !!file;
  const hasTranscript = transcript.trim().length > 0;
  const hasDualInput = hasAudio && hasTranscript;

  const loadingMessage = useMemo(() => {
    if (hasDualInput) return "Transcribing recording + merging with notes...";
    if (hasAudio) return "Transcribing recording...";
    return "Analyzing stall patterns...";
  }, [hasAudio, hasDualInput]);

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

    try {
      const data = await runPostMortem({
        file,
        transcript,
        dealValue,
      });
      setResult(data);
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
    const text = result.restart_plan.map((item, i) => `${i + 1}. ${item}`).join("\n");
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
          {loading
            ? "AUTOPSY IN PROGRESS..."
            : result
              ? "TRIAGE COMPLETE"
              : "STANDBY"}
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
                  ? "Recording loaded — ready for autopsy"
                  : "Drop Stalled Call Recording (.mp3/.wav/.mp4) — Initiate Autopsy"}
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
                Use alone, or together with a recording for richer analysis
              </span>
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste transcript, email thread, CRM notes, or follow-up context..."
            />
          </div>

          <button className="run-button" onClick={handleRun} disabled={loading}>
            {loading ? "Running Autopsy..." : "Run Sales Post-Mortem"}
          </button>

          {error && <div className="error-banner">{error}</div>}
        </section>

        <section className="panel panel-right">
          <div className="panel-label">Engine Triage Output</div>

          {loading ? (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>{loadingMessage}</span>
            </div>
          ) : result ? (
            <div className="cards">
              {result.sources && (
                <div className="sources-bar">
                  {result.sources.audio && <span>Audio transcribed</span>}
                  {result.sources.manual && <span>Manual notes merged</span>}
                  {result.sources.audio && result.sources.manual && (
                    <span className="sources-merged">Combined analysis</span>
                  )}
                </div>
              )}

              <article className="card card-red">
                <h2 className="card-title">Primary Cause of Death</h2>
                <div className="card-body">
                  <p>{result.stall_cause}</p>
                </div>
              </article>

              <article className="card card-amber">
                <h2 className="card-title">Momentum Blocker Analysis</h2>
                <div className="card-body">
                  <p>{result.why_it_stalled}</p>
                </div>
              </article>

              <article className="card card-emerald">
                <h2 className="card-title">Resuscitation Plan</h2>
                <div className="card-body">
                  <ul className="restart-list">
                    {result.restart_plan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <button
                    className={`copy-button ${copied ? "copied" : ""}`}
                    onClick={copyActionItems}
                  >
                    {copied ? "Copied!" : "Copy Action Items"}
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
