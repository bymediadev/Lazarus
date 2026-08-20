interface Props {
  hasInput: boolean;
  hasResult: boolean;
  loading: boolean;
  sourceCount: number;
  demoLoading: boolean;
  onLoadDemo: () => void;
  onOpenGuide: () => void;
}

export default function IntakeHowTo({
  hasInput,
  hasResult,
  loading,
  sourceCount,
  demoLoading,
  onLoadDemo,
  onOpenGuide,
}: Props) {
  const status = loading
    ? "Analyzing…"
    : hasResult
      ? "Brief ready."
      : hasInput
        ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} ready.`
        : "Add evidence to begin.";

  return (
    <aside className="intake-how-to" data-guide-target="guide-intake" aria-label="How to run Lazarus Deal Recovery">
      <div>
        <h2 className="intake-how-to-title">Deal evidence</h2>
        <p className="intake-how-to-entry">This is the left pane — add the stalled deal here.</p>
        <p className="intake-how-to-hint">
          Add a recording, transcript, email thread, or notes from your CRM. Compile them in one
          run for a full picture of the deal.
        </p>
        <p className="intake-how-to-status">{status}</p>
      </div>
      <div className="intake-how-to-actions">
        <button type="button" className="btn-secondary intake-how-to-demo" onClick={onOpenGuide}>
          Open guide
        </button>
        {!hasInput && (
          <button
            type="button"
            className="btn-secondary intake-how-to-demo"
            onClick={onLoadDemo}
            disabled={demoLoading}
          >
            {demoLoading ? "Loading…" : "Try sample"}
          </button>
        )}
      </div>
    </aside>
  );
}
