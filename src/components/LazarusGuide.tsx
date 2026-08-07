import { useEffect, useMemo, useState } from "react";
import {
  GUIDE_STEPS,
  GUIDE_WORKFLOWS,
  type GuideStep,
  type GuideWorkflow,
} from "../../shared/guideContent";
import { askGuideChat } from "../lib/guideChat";

interface Props {
  open: boolean;
  onClose: () => void;
  onHighlightTarget?: (target: string | null) => void;
  onSelectTab?: (tab: "call" | "email" | "field" | "live") => void;
}

type ChatTurn = { role: "user" | "assistant"; content: string; steps?: string[] };

function workflowSteps(wf: GuideWorkflow): GuideStep[] {
  const out: GuideStep[] = [];
  let id: string | undefined = wf.firstStepId;
  while (id && GUIDE_STEPS[id]) {
    out.push(GUIDE_STEPS[id]);
    id = GUIDE_STEPS[id].next;
  }
  return out;
}

export default function LazarusGuide({ open, onClose, onHighlightTarget, onSelectTab }: Props) {
  const [workflowId, setWorkflowId] = useState(GUIDE_WORKFLOWS[0].id);
  const [stepIndex, setStepIndex] = useState(0);
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);

  const workflow = useMemo(
    () => GUIDE_WORKFLOWS.find((w) => w.id === workflowId) ?? GUIDE_WORKFLOWS[0],
    [workflowId]
  );
  const steps = useMemo(() => workflowSteps(workflow), [workflow]);
  const step = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (!open) {
      onHighlightTarget?.(null);
      return;
    }
    onHighlightTarget?.(step?.target ?? null);
    if (step?.target === "guide-live-tab") onSelectTab?.("live");
    if (step?.target === "guide-upload-tab") onSelectTab?.("call");
  }, [open, step, onHighlightTarget, onSelectTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickWorkflow = (id: string) => {
    setWorkflowId(id);
    setStepIndex(0);
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || chatBusy) return;
    setChatBusy(true);
    setChatError(null);
    const nextHistory = [...chat, { role: "user" as const, content: q }];
    setChat(nextHistory);
    setQuestion("");
    try {
      const res = await askGuideChat(
        q,
        nextHistory.map((t) => ({ role: t.role, content: t.content }))
      );
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: res.answer, steps: res.steps },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Guide could not answer.");
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true" aria-label="How to use Lazarus">
      <button type="button" className="guide-backdrop" aria-label="Close guide" onClick={onClose} />
      <aside className="guide-drawer">
        <header className="guide-drawer-header">
          <div>
            <h2>How to use Lazarus</h2>
            <p>Step-by-step product help — not a deal analyst.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="guide-workflows">
          {GUIDE_WORKFLOWS.map((wf) => (
            <button
              key={wf.id}
              type="button"
              className={`guide-workflow-chip${wf.id === workflowId ? " active" : ""}`}
              onClick={() => pickWorkflow(wf.id)}
            >
              {wf.title}
            </button>
          ))}
        </div>

        <section className="guide-step-card" aria-live="polite">
          <p className="guide-step-meta">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h3>{step?.title}</h3>
          <p>{step?.body}</p>
          <div className="guide-step-nav">
            <button
              type="button"
              className="btn-secondary"
              disabled={stepIndex <= 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={stepIndex >= steps.length - 1}
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            >
              Next
            </button>
          </div>
        </section>

        <section className="guide-chat">
          <h3>Ask a how-to question</h3>
          <div className="guide-chat-log">
            {chat.length === 0 && (
              <p className="guide-chat-empty">
                Examples: “How do I run my first analysis?” · “How do I push notes to HubSpot?”
              </p>
            )}
            {chat.map((turn, i) => (
              <div key={i} className={`guide-chat-turn guide-chat-${turn.role}`}>
                <p>{turn.content}</p>
                {turn.steps && turn.steps.length > 0 && (
                  <ol>
                    {turn.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
          {chatError && <p className="guide-chat-error">{chatError}</p>}
          <div className="guide-chat-compose">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
              placeholder="Ask how to use Lazarus…"
              disabled={chatBusy}
              aria-label="Guide question"
            />
            <button type="button" className="btn-secondary" onClick={() => void ask()} disabled={chatBusy}>
              {chatBusy ? "…" : "Ask"}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
