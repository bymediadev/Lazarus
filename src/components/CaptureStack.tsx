type SourceStatus = "import" | "soon";

interface CaptureStackProps {
  onOpenLiveTab?: (platform?: "zoom" | "meet" | "teams") => void;
}

interface CaptureSource {
  id: string;
  label: string;
  status: SourceStatus;
}

const CAPTURE_SOURCES: CaptureSource[] = [
  { id: "zoom", label: "Zoom", status: "import" as const },
  { id: "meet", label: "Google Meet", status: "import" as const },
  { id: "teams", label: "Microsoft Teams", status: "import" as const },
  { id: "gong", label: "Gong", status: "import" },
  { id: "chorus", label: "Chorus", status: "import" },
  { id: "otter", label: "Otter", status: "import" },
];

export default function CaptureStack({ onOpenLiveTab }: CaptureStackProps) {
  return (
    <section className="capture-stack" aria-label="How Lazarus fits your stack">
      <p className="capture-stack-eyebrow">Three layers — keep your recorder, add judgment</p>
      <ol className="capture-stack-layers">
        <li>
          <strong>Layer 1 — Capture</strong>
          <span>Zoom, Meet, Teams, Gong, or your phone saves the call.</span>
        </li>
        <li>
          <strong>Layer 2 — Lazarus</strong>
          <span>Scores deal risk, maps people, links today to past notes.</span>
        </li>
        <li>
          <strong>Layer 3 — You</strong>
          <span>Rep and manager run the deal. Lazarus does not close for you.</span>
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
            File upload
          </span>
        </div>
        <p className="capture-stack-note">
          <strong>Today:</strong> use the <strong>Live Meeting</strong> tab — float the objection panel in the
          corner during Zoom, Meet, or Teams (mic + paste).{" "}
          <strong>Next:</strong> one-click platform OAuth so recordings land automatically.
        </p>
      </div>
    </section>
  );
}
