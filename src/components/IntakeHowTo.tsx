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
  const step1Done = hasInput;
  const step2Done = hasResult && !loading;
  const step2Active = step1Done && !step2Done;
  const step3Active = step2Done;

  return (
    <aside className="intake-how-to" aria-label="How to run Lazarus">
      <h2 className="intake-how-to-title">How to run it</h2>
      <ol className="intake-how-to-steps">
        <li className={step1Done ? "intake-step-done" : "intake-step-active"}>
          <span className="intake-step-num" aria-hidden="true">
            1
          </span>
          <div className="intake-step-body">
            <strong>Add a sales call</strong>
            <p>
              Upload an audio file (.mp3 / .wav / .mp4) or paste a transcript — or use the sample
              demo.
            </p>
            <button
              type="button"
              className="btn-secondary intake-how-to-demo"
              onClick={onLoadDemo}
              disabled={demoLoading}
            >
              {demoLoading ? "Loading sample…" : "Use sample demo transcript"}
            </button>
          </div>
        </li>
        <li
          className={
            step2Done ? "intake-step-done" : step2Active ? "intake-step-active" : undefined
          }
        >
          <span className="intake-step-num" aria-hidden="true">
            2
          </span>
          <div className="intake-step-body">
            <strong>Run Deal Analysis</strong>
            <p>Click the green button below. Lazarus scores the deal and builds the recovery brief.</p>
          </div>
        </li>
        <li className={step3Active ? "intake-step-done intake-step-active" : undefined}>
          <span className="intake-step-num" aria-hidden="true">
            3
          </span>
          <div className="intake-step-body">
            <strong>Review the report</strong>
            <p>
              On the right: forecast snapshot, what’s going on, who owns what, what to do next — then
              copy the CRM overview when you’re ready.
            </p>
          </div>
        </li>
      </ol>
    </aside>
  );
}
