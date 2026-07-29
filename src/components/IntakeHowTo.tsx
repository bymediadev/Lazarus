interface Props {
  hasInput: boolean;
  hasResult: boolean;
  loading: boolean;
  demoLoading: boolean;
  onLoadDemo: () => void;
  onFocusRun?: () => void;
}

export default function IntakeHowTo({
  hasInput,
  hasResult,
  loading,
  demoLoading,
  onLoadDemo,
}: Props) {
  const status = loading
    ? "Analyzing every attached source…"
    : hasResult
      ? "Brief ready — review, then copy to CRM."
      : hasInput
        ? "Evidence attached — add more or run analysis."
        : "Add evidence, analyze once, then copy the brief to your CRM.";

  return (
    <aside className="intake-how-to" aria-label="How to run Lazarus">
      <div>
        <h2 className="intake-how-to-title">One deal. One evidence package.</h2>
        <p className="intake-how-to-status">{status}</p>
      </div>
      {!hasInput && (
        <button
          type="button"
          className="btn-secondary intake-how-to-demo"
          onClick={onLoadDemo}
          disabled={demoLoading}
        >
          {demoLoading ? "Loading sample…" : "Use sample"}
        </button>
      )}
    </aside>
  );
}
