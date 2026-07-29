interface Props {
  hasInput: boolean;
  hasResult: boolean;
  loading: boolean;
  sourceCount: number;
  demoLoading: boolean;
  onLoadDemo: () => void;
  onRun: () => void;
}

export default function IntakeHowTo({
  hasInput,
  hasResult,
  loading,
  sourceCount,
  demoLoading,
  onLoadDemo,
  onRun,
}: Props) {
  const status = loading
    ? "Analyzing…"
    : hasResult
      ? "Brief ready."
      : hasInput
        ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} ready.`
        : "Add evidence to begin.";

  return (
    <aside className="intake-how-to" aria-label="How to run Lazarus">
      <div>
        <h2 className="intake-how-to-title">Deal evidence</h2>
        <p className="intake-how-to-status">{status}</p>
      </div>
      <div className="intake-how-to-actions">
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
        <button
          type="button"
          className="btn-primary intake-quick-run"
          onClick={onRun}
          disabled={!hasInput || loading}
        >
          {loading ? "Running…" : "Run analysis"}
        </button>
      </div>
    </aside>
  );
}
