import { useEffect, useMemo, useState } from "react";
import TrustPackLink from "./TrustPackLink";

export interface DemoTestGuideProps {
  apiOnline: boolean | null;
  activeTab: "call" | "email" | "field" | "live";
  hasCallInput: boolean;
  hasResult: boolean;
  loading: boolean;
  liveSessionActive: boolean;
  liveTurnCount: number;
  liveEndedWithTurns: boolean;
  onGoCallTab: () => void;
  onGoLiveTab: () => void;
  onLoadSampleTranscript: () => void;
  onRunAnalysis: () => void;
  onScrollToWorkspace: () => void;
}

type StepStatus = "locked" | "current" | "done";

interface StepDef {
  id: string;
  title: string;
  body: string;
  done: boolean;
  actionLabel?: string;
  onAction?: () => void;
  art: "server" | "tab" | "paste" | "run" | "brief" | "browser" | "live" | "mic" | "end";
}

const PATH_A_DONE_KEY = "lazarus-demo-path-a-done";
const PATH_B_DONE_KEY = "lazarus-demo-path-b-done";

function StepArt({ kind }: { kind: StepDef["art"] }) {
  const common = {
    viewBox: "0 0 120 80",
    className: "demo-step-art-svg",
    "aria-hidden": true as const,
  };
  switch (kind) {
    case "server":
      return (
        <svg {...common}>
          <rect x="28" y="18" width="64" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="40" cy="40" r="3" fill="currentColor" />
          <circle cx="52" cy="40" r="3" fill="currentColor" />
          <path d="M64 40h20" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "tab":
      return (
        <svg {...common}>
          <rect x="16" y="22" width="88" height="42" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 34h88" stroke="currentColor" strokeWidth="2" />
          <rect x="24" y="24" width="28" height="10" rx="2" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case "paste":
      return (
        <svg {...common}>
          <rect x="34" y="14" width="52" height="54" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M44 28h32M44 40h28M44 52h20" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "run":
      return (
        <svg {...common}>
          <circle cx="60" cy="40" r="26" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M52 28l24 12-24 12z" fill="currentColor" />
        </svg>
      );
    case "brief":
      return (
        <svg {...common}>
          <rect x="20" y="16" width="80" height="50" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M30 30h40M30 42h54M30 54h32" stroke="currentColor" strokeWidth="2" />
          <circle cx="88" cy="30" r="6" fill="currentColor" />
        </svg>
      );
    case "browser":
      return (
        <svg {...common}>
          <rect x="18" y="16" width="84" height="50" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M18 28h84" stroke="currentColor" strokeWidth="2" />
          <circle cx="28" cy="22" r="2" fill="currentColor" />
          <circle cx="36" cy="22" r="2" fill="currentColor" />
          <text x="48" y="50" fontSize="10" fill="currentColor" fontFamily="monospace">
            Chrome
          </text>
        </svg>
      );
    case "live":
      return (
        <svg {...common}>
          <rect x="16" y="18" width="88" height="46" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="36" cy="42" r="8" fill="currentColor" opacity="0.4" />
          <text x="52" y="46" fontSize="11" fill="currentColor" fontFamily="monospace">
            LIVE
          </text>
        </svg>
      );
    case "mic":
      return (
        <svg {...common}>
          <rect x="52" y="14" width="16" height="28" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M40 36a20 20 0 0040 0" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M60 56v10M48 66h24" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "end":
      return (
        <svg {...common}>
          <rect x="30" y="22" width="60" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="48" y="34" width="24" height="12" fill="currentColor" />
        </svg>
      );
    default:
      return null;
  }
}

function statusFor(index: number, doneFlags: boolean[]): StepStatus {
  const allPrevDone = doneFlags.slice(0, index).every(Boolean);
  if (!allPrevDone) return "locked";
  if (doneFlags[index]) return "done";
  return "current";
}

export default function DemoTestGuide({
  apiOnline,
  activeTab,
  hasCallInput,
  hasResult,
  loading,
  liveSessionActive,
  liveTurnCount,
  liveEndedWithTurns,
  onGoCallTab,
  onGoLiveTab,
  onLoadSampleTranscript,
  onRunAnalysis,
  onScrollToWorkspace,
}: DemoTestGuideProps) {
  const [pathAReviewed, setPathAReviewed] = useState(false);
  const [pathBBrowserOk, setPathBBrowserOk] = useState(false);
  const [pathAStoredDone, setPathAStoredDone] = useState(false);
  const [pathBStoredDone, setPathBStoredDone] = useState(false);

  useEffect(() => {
    try {
      setPathAStoredDone(localStorage.getItem(PATH_A_DONE_KEY) === "1");
      setPathBStoredDone(localStorage.getItem(PATH_B_DONE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const chromeLike =
      /Chrome|Edg|Chromium/i.test(navigator.userAgent) && !/OPR|Opera/i.test(navigator.userAgent);
    if (chromeLike) setPathBBrowserOk(true);
  }, []);

  const pathADones = useMemo(
    () => [
      apiOnline === true,
      activeTab === "call",
      hasCallInput,
      hasResult && !loading,
      pathAReviewed || (hasResult && !loading),
    ],
    [apiOnline, activeTab, hasCallInput, hasResult, loading, pathAReviewed]
  );

  useEffect(() => {
    if (hasResult && !loading && pathADones.slice(0, 4).every(Boolean)) {
      setPathAReviewed(true);
    }
  }, [hasResult, loading, pathADones]);

  const pathAComplete = pathADones.every(Boolean) || pathAStoredDone;

  useEffect(() => {
    if (pathADones.every(Boolean) && !pathAStoredDone) {
      try {
        localStorage.setItem(PATH_A_DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      setPathAStoredDone(true);
    }
  }, [pathADones, pathAStoredDone]);

  const pathBDones = useMemo(
    () => [
      pathBBrowserOk,
      apiOnline === true,
      activeTab === "live" || liveSessionActive || liveEndedWithTurns,
      liveSessionActive || liveEndedWithTurns,
      liveTurnCount > 0 || liveEndedWithTurns,
      liveEndedWithTurns && hasResult && !loading,
    ],
    [
      pathBBrowserOk,
      apiOnline,
      activeTab,
      liveSessionActive,
      liveEndedWithTurns,
      liveTurnCount,
      hasResult,
      loading,
    ]
  );

  const pathBComplete = pathBDones.every(Boolean) || pathBStoredDone;

  useEffect(() => {
    if (pathBDones.every(Boolean) && !pathBStoredDone) {
      try {
        localStorage.setItem(PATH_B_DONE_KEY, "1");
      } catch {
        /* ignore */
      }
      setPathBStoredDone(true);
    }
  }, [pathBDones, pathBStoredDone]);

  const pathASteps: StepDef[] = [
    {
      id: "a1",
      title: "1 — Server on",
      body: "Header should show API online. If offline, run npm run dev or wake your hosted URL.",
      done: pathADones[0],
      actionLabel: apiOnline !== true ? "Scroll to workspace" : undefined,
      onAction: onScrollToWorkspace,
      art: "server",
    },
    {
      id: "a2",
      title: "2 — Open Call Auto-Autopsy",
      body: "Click Call Auto-Autopsy in Deal Intake. That is where you paste a past call.",
      done: pathADones[1],
      actionLabel: "Go to Call Auto-Autopsy",
      onAction: () => {
        onGoCallTab();
        onScrollToWorkspace();
      },
      art: "tab",
    },
    {
      id: "a3",
      title: "3 — Load a transcript",
      body: "Paste your stalled call, or use our sample (Sarah & Mark). Turns green when text is attached.",
      done: pathADones[2],
      actionLabel: "Load sample transcript",
      onAction: () => {
        onGoCallTab();
        onLoadSampleTranscript();
        onScrollToWorkspace();
      },
      art: "paste",
    },
    {
      id: "a4",
      title: "4 — Run Deal Analysis",
      body: "Press Run Deal Analysis. Wait for the score and Recovery Brief on the right.",
      done: pathADones[3],
      actionLabel: loading ? "Running…" : "Run Deal Analysis",
      onAction: () => {
        onGoCallTab();
        onScrollToWorkspace();
        onRunAnalysis();
      },
      art: "run",
    },
    {
      id: "a5",
      title: "5 — Read the brief",
      body: "Check risk, blockers, and next action on the right. Completes when a brief exists — then Path B unlocks.",
      done: pathADones[4],
      actionLabel: hasResult && !pathAReviewed ? "Mark brief reviewed" : undefined,
      onAction: () => setPathAReviewed(true),
      art: "brief",
    },
  ];

  const pathBSteps: StepDef[] = [
    {
      id: "b1",
      title: "1 — Chrome or Edge",
      body: "Live mic captions need Chrome or Edge. Safari/Firefox: paste notes only.",
      done: pathBDones[0],
      actionLabel: "I am on Chrome or Edge",
      onAction: () => setPathBBrowserOk(true),
      art: "browser",
    },
    {
      id: "b2",
      title: "2 — Server still on",
      body: "Same rule as Path A — API online in the header.",
      done: pathBDones[1],
      art: "server",
    },
    {
      id: "b3",
      title: "3 — Open Live Meeting",
      body: "Select Live Meeting. Zoom is pre-selected. Skip Connect Zoom unless you want auto-transcripts later.",
      done: pathBDones[2],
      actionLabel: "Go to Live Meeting",
      onAction: () => {
        onGoLiveTab();
        onScrollToWorkspace();
      },
      art: "live",
    },
    {
      id: "b4",
      title: "4 — Start live session",
      body: "Click Start live session. Allow the mic. Join your Zoom/Meet/Teams call in another window.",
      done: pathBDones[3],
      actionLabel: "Open Live Meeting",
      onAction: () => {
        onGoLiveTab();
        onScrollToWorkspace();
      },
      art: "run",
    },
    {
      id: "b5",
      title: "5 — Capture dialogue",
      body: "Speak or paste a buyer line, e.g. Buyer: Legal needs a DPA first. Watch the Recovery Brief update.",
      done: pathBDones[4],
      actionLabel: "Open Live Meeting",
      onAction: () => {
        onGoLiveTab();
        onScrollToWorkspace();
      },
      art: "mic",
    },
    {
      id: "b6",
      title: "6 — End & analyze",
      body: "Click End & run analysis, then Run Deal Analysis if needed. Green when a brief exists after your live session.",
      done: pathBDones[5],
      actionLabel: liveEndedWithTurns && !hasResult ? "Run Deal Analysis" : "Go to Call Auto-Autopsy",
      onAction: () => {
        onGoCallTab();
        onScrollToWorkspace();
        if (liveEndedWithTurns && !hasResult && !loading) onRunAnalysis();
      },
      art: "end",
    },
  ];

  return (
    <section className="demo-guide" id="demo-test-guide" aria-labelledby="demo-guide-heading">
      <div className="demo-guide-top">
        <div className="demo-guide-intro">
          <span className="demo-guide-label">Self-serve demo · step-by-step</span>
          <h2 id="demo-guide-heading">Try Lazarus without calling us</h2>
          <p>
            Finish Path A in order — each step turns green before the next unlocks. Path B then
            unlocks for a live call this week. Security Battlecard sits beside this guide for IT /
            legal.
          </p>
        </div>
        <aside className="demo-guide-trust-card">
          <span className="demo-guide-trust-label">Security Battlecard</span>
          <p>One-page answers for IT / legal before a pilot week.</p>
          <TrustPackLink slug="battlecard">Open Security Battlecard →</TrustPackLink>
          <div className="demo-guide-trust-secondary">
            <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>
          </div>
        </aside>
      </div>

      <div className="demo-guide-paths">
        <PathColumn
          title="Path A — Past call (today)"
          subtitle="Paste → score. Proves the judgment layer."
          complete={pathAComplete}
          locked={false}
          steps={pathASteps}
        />
        <PathColumn
          title="Path B — Live call (this week)"
          subtitle="Start → mic/paste → end → analyze. No Zoom Connect required."
          complete={pathBComplete}
          locked={!pathAComplete}
          lockReason="Finish all Path A steps first — then Path B unlocks."
          steps={pathBSteps}
        />
      </div>

      <p className="demo-guide-footnote">
        Sample load uses a short stall excerpt (authority gap). Optional Zoom Connect is under Live
        Meeting → Optional. You do not need the Zoom Marketplace.
      </p>
    </section>
  );
}

function PathColumn({
  title,
  subtitle,
  complete,
  locked,
  lockReason,
  steps,
}: {
  title: string;
  subtitle: string;
  complete: boolean;
  locked: boolean;
  lockReason?: string;
  steps: StepDef[];
}) {
  const flags = steps.map((s) => s.done);

  return (
    <div
      className={`demo-path${complete ? " demo-path-complete" : ""}${locked ? " demo-path-locked" : ""}`}
    >
      <header className="demo-path-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        {complete && <span className="demo-path-badge">Complete</span>}
        {locked && <span className="demo-path-badge demo-path-badge-locked">Locked</span>}
      </header>
      {locked && lockReason && <p className="demo-path-lock-msg">{lockReason}</p>}
      <ol className="demo-step-list">
        {steps.map((step, i) => {
          const status = locked ? "locked" : statusFor(i, flags);
          const canAct = status === "current" && !step.done && !!step.onAction && !!step.actionLabel;
          return (
            <li
              key={step.id}
              className={`demo-step demo-step-${status}`}
              aria-current={status === "current" ? "step" : undefined}
            >
              <div className="demo-step-art">
                <StepArt kind={step.art} />
                <span className="demo-step-check" aria-hidden="true">
                  {status === "done" ? "✓" : status === "current" ? "→" : "·"}
                </span>
              </div>
              <div className="demo-step-copy">
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                {canAct && (
                  <button
                    type="button"
                    className="demo-step-btn"
                    onClick={step.onAction}
                    disabled={step.actionLabel === "Running…"}
                  >
                    {step.actionLabel}
                  </button>
                )}
                {status === "locked" && !locked && (
                  <p className="demo-step-wait">Finish the step above first.</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
