type SourceStatus = "import" | "soon";

interface CaptureStackProps {
  onOpenLiveTab?: (platform?: "zoom" | "meet" | "teams") => void;
}

interface CaptureSource {
  id: string;
  label: string;
  status: SourceStatus;
}

/** Meeting platforms only — Lazarus Deal Recovery sits on top; no CI/note-taker brand fight. */
const CAPTURE_SOURCES: CaptureSource[] = [
  { id: "meet", label: "Google Meet", status: "import" },
  { id: "teams", label: "Microsoft Teams", status: "import" },
  { id: "zoom", label: "Zoom", status: "import" },
];

export default function CaptureStack({ onOpenLiveTab }: CaptureStackProps) {
  return (
    <section className="capture-stack" aria-label="How Lazarus Deal Recovery fits your stack">
      <p className="capture-stack-eyebrow">Three layers — keep your meetings, add judgment</p>
      <ol className="capture-stack-layers">
        <li>
          <strong>Layer 1 — Capture</strong>
          <span>Meet, Teams, or whatever you already use to meet and save the call.</span>
        </li>
        <li>
          <strong>Layer 2 — Lazarus Deal Recovery</strong>
          <span>Scores deal risk, maps people, links today to past notes.</span>
        </li>
        <li>
          <strong>Layer 3 — You</strong>
          <span>Rep and manager run the deal. Lazarus Deal Recovery does not close for you.</span>
        </li>
      </ol>

      <div className="capture-stack-sources">
        <span className="capture-stack-sources-label">Bring a call in from</span>
        <div className="capture-source-chips" role="list">
          {CAPTURE_SOURCES.map((source) => {
            const isLivePlatform =
              source.id === "zoom" || source.id === "meet" || source.id === "teams";
            const liveId = isLivePlatform
              ? (source.id as "zoom" | "meet" | "teams")
              : undefined;
            return (
              <span
                key={source.id}
                className={`capture-source-chip capture-source-${source.status}${isLivePlatform && onOpenLiveTab ? " capture-source-chip-clickable" : ""}`}
                role="listitem"
                onClick={
                  isLivePlatform && onOpenLiveTab
                    ? () => onOpenLiveTab(liveId)
                    : undefined
                }
                onKeyDown={
                  isLivePlatform && onOpenLiveTab
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenLiveTab(liveId);
                        }
                      }
                    : undefined
                }
                tabIndex={isLivePlatform && onOpenLiveTab ? 0 : undefined}
              >
                {source.label}
                {isLivePlatform && <span className="capture-source-badge">Live tab</span>}
              </span>
            );
          })}
          <span className="capture-source-chip capture-source-import" role="listitem">
            File / transcript
          </span>
        </div>
        <p className="capture-stack-note">
          <strong>Today:</strong> Zoom RTMS, Meet captions via the Chrome extension (Captions on), or
          Teams mic + paste — same live Recovery Brief. Or drop a recording / paste a transcript.{" "}
          <strong>Pitch:</strong> Keep your meeting tools. Lazarus Deal Recovery is the judgment layer
          on top.
        </p>
      </div>
    </section>
  );
}
