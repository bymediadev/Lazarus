import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { navigateApp } from "../lib/appRoute";
import { contactMailto, sendContactNote } from "../lib/contact";
import { BOOKING_URL } from "../lib/site";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { DEMO_DEALS, FORECAST_CALL_LINE } from "./deals";
import { handoffMessage } from "./handoff";
import { qualify, tierLabel } from "./score";
import type {
  AcvBand,
  ForecastOwnership,
  QualifierAnswers,
  QualifierIntent,
  QualifierPain,
  QualifierRole,
  SellingMotion,
} from "./types";
import "./off-hours.css";

const STORAGE_KEY = "ldr-off-hours-v1";

type Step = "intro" | "question" | "result" | "demo" | "handoff" | "thanks";

type Draft = {
  role?: QualifierRole;
  ownership?: ForecastOwnership;
  motion?: SellingMotion;
  acv?: AcvBand;
  pains: QualifierPain[];
  intent?: QualifierIntent;
};

const EMPTY_DRAFT: Draft = { pains: [] };

const ROLES: { value: QualifierRole; label: string }[] = [
  { value: "sales-manager", label: "I run it as a sales manager" },
  { value: "vp-sales", label: "I run it as VP of Sales" },
  { value: "cro", label: "I’m the CRO and I still inspect deals" },
  { value: "head-of-bd", label: "I lead BD at an MSP or services firm" },
  { value: "ae", label: "I’m an AE or SDR" },
  { value: "revops", label: "I advise or run RevOps. I don’t own the number" },
  { value: "other", label: "Someone else" },
];

const OWNERSHIP: { value: ForecastOwnership; label: string }[] = [
  { value: "owns-call", label: "I own the call and the number" },
  { value: "inspects", label: "I inspect deals in that call" },
  { value: "no-number", label: "I don’t own a forecast number" },
];

const MOTIONS: { value: SellingMotion; label: string }[] = [
  { value: "saas", label: "Mid-market B2B SaaS" },
  { value: "msp", label: "MSP or IT services" },
  { value: "complex-b2b", label: "Other complex B2B with recorded calls" },
  { value: "transactional", label: "Short-cycle or self-serve" },
  { value: "enterprise-soc2", label: "Enterprise, and we need SOC 2 before a pilot" },
];

const ACVS: { value: AcvBand; label: string }[] = [
  { value: "under-15k", label: "Under $15K" },
  { value: "mid-saas", label: "$25K–$150K" },
  { value: "services", label: "$50K–$250K services engagements" },
  { value: "above", label: "Larger than that" },
  { value: "unsure", label: "Not sure" },
];

const PAINS: { value: QualifierPain; label: string }[] = [
  { value: "forecast-slip", label: "Deals keep slipping and I can’t explain it" },
  { value: "manual-inspection", label: "I’m listening to calls to figure out what’s real" },
  { value: "happy-ears", label: "Reps say it’s warm. Nothing is moving" },
  { value: "healthy-pipeline", label: "The pipeline is healthy. Stalls are rare" },
  { value: "wants-outreach", label: "We want software that sends outreach or closes" },
];

const INTENTS: { value: QualifierIntent; label: string }[] = [
  {
    value: "forecast-clarity",
    label: "Tell me which deals will close, what’s blocking the rest, and what to do next",
  },
  { value: "replace-recorder", label: "Replace our recorder or conversation-intelligence tool" },
  { value: "autonomous", label: "Send outreach or close deals for the team" },
  { value: "rep-notes", label: "Take notes for me as a rep" },
];

const QUESTIONS = [
  { id: "role" as const, prompt: "Who owns the forecast where you work?", options: ROLES },
  { id: "ownership" as const, prompt: "Do you sit in the forecast call?", options: OWNERSHIP },
  { id: "motion" as const, prompt: "What does the selling motion look like?", options: MOTIONS },
  { id: "acv" as const, prompt: "Typical deal size?", options: ACVS },
  { id: "pains" as const, prompt: "What is true before the next forecast call?", options: PAINS },
  { id: "intent" as const, prompt: "What do you want Lazarus Deal Recovery to do?", options: INTENTS },
];

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function isStep(value: unknown): value is Step {
  return (
    value === "intro" ||
    value === "question" ||
    value === "result" ||
    value === "demo" ||
    value === "handoff" ||
    value === "thanks"
  );
}

function restore(): {
  step: Step;
  questionIndex: number;
  draft: Draft;
  demoStarted: boolean;
  opened: string[];
} | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      step?: unknown;
      questionIndex?: unknown;
      draft?: Draft;
      demoStarted?: unknown;
      opened?: unknown;
    };
    if (!isStep(parsed.step) || parsed.step === "thanks") return null;
    const draft = parsed.draft ?? EMPTY_DRAFT;
    return {
      step: parsed.step,
      questionIndex:
        typeof parsed.questionIndex === "number"
          ? Math.max(0, Math.min(QUESTIONS.length - 1, parsed.questionIndex))
          : 0,
      draft: {
        role: draft.role,
        ownership: draft.ownership,
        motion: draft.motion,
        acv: draft.acv,
        pains: Array.isArray(draft.pains) ? draft.pains : [],
        intent: draft.intent,
      },
      demoStarted: parsed.demoStarted === true,
      opened: Array.isArray(parsed.opened) ? parsed.opened.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return null;
  }
}

function completeAnswers(draft: Draft): QualifierAnswers | null {
  if (!draft.role || !draft.ownership || !draft.motion || !draft.acv || !draft.intent) return null;
  if (draft.pains.length === 0) return null;
  return {
    role: draft.role,
    ownership: draft.ownership,
    motion: draft.motion,
    acv: draft.acv,
    pains: draft.pains,
    intent: draft.intent,
  };
}

type Props = {
  mode: "page" | "dock";
  onOpenPortal?: () => void;
};

export default function OffHoursQualifier({ mode, onOpenPortal }: Props) {
  const saved = useMemo(() => restore(), []);
  const [open, setOpen] = useState(mode === "page");
  const [step, setStep] = useState<Step>(saved?.step ?? "intro");
  const [questionIndex, setQuestionIndex] = useState(saved?.questionIndex ?? 0);
  const [draft, setDraft] = useState<Draft>(saved?.draft ?? EMPTY_DRAFT);
  const [demoStarted, setDemoStarted] = useState(saved?.demoStarted ?? false);
  const [revealed, setRevealed] = useState(0);
  const [opened, setOpened] = useState<string[]>(saved?.opened ?? []);
  const [activeDeal, setActiveDeal] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const reduced = usePrefersReducedMotion();
  const titleId = useId();
  const answers = completeAnswers(draft);
  const answersReady = answers !== null;
  const result = answers ? qualify(answers) : null;
  const showBooking = result?.tier === "primary" || result?.tier === "secondary" || result?.tier === "partner-later";

  useEffect(() => {
    if ((step === "result" || step === "demo" || step === "handoff") && !answersReady) {
      setStep("question");
    }
  }, [step, answersReady]);

  useEffect(() => {
    try {
      if (step === "thanks") {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ step, questionIndex, draft, demoStarted, opened })
      );
    } catch {
      /* private mode */
    }
  }, [step, questionIndex, draft, demoStarted, opened]);

  useEffect(() => {
    if (!demoStarted) return;
    if (reduced) {
      setRevealed(DEMO_DEALS.length);
      return;
    }
    setRevealed(0);
    const timers = DEMO_DEALS.map((_, index) =>
      window.setTimeout(() => setRevealed(index + 1), 420 * (index + 1))
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [demoStarted, reduced]);

  useEffect(() => {
    if (mode === "dock" && !open) return;
    headingRef.current?.focus();
  }, [mode, open, step, questionIndex]);

  useEffect(() => {
    if (mode !== "dock" || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        launchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, open]);

  const question = QUESTIONS[questionIndex];
  const questionReady =
    question.id === "pains" ? draft.pains.length > 0 : Boolean(draft[question.id]);

  const goNextQuestion = () => {
    if (!questionReady) return;
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(questionIndex + 1);
      return;
    }
    setStep("result");
  };

  const startDemo = () => setStep("demo");

  const openedNames = DEMO_DEALS.filter((deal) => opened.includes(deal.id)).map((deal) => deal.name);

  useEffect(() => {
    if (step !== "handoff" || !answers || !result || noteTouched) return;
    setNote(
      handoffMessage({
        answers,
        result,
        name,
        company,
        openedDeals: openedNames,
      })
    );
  }, [step, answers, result, name, company, noteTouched, openedNames]);

  const leaveNote = () => {
    if (!answers || !result) return;
    setNoteTouched(false);
    setError(null);
    setStep("handoff");
  };

  const copyCrm = async (id: string, text: string) => {
    setCopyNotice(null);
    const wrote = await writeClipboard(text);
    if (!wrote) {
      setCopyNotice("Select the note and copy it.");
      return;
    }
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!answers || !result) return;
    setBusy(true);
    setError(null);
    const openedNames = DEMO_DEALS.filter((deal) => opened.includes(deal.id)).map((deal) => deal.name);
    const message =
      note.trim() ||
      handoffMessage({
        answers,
        result,
        name,
        company,
        openedDeals: openedNames,
      });
    try {
      await sendContactNote({
        topic: "sales",
        name: name.trim(),
        email: email.trim(),
        message: message.slice(0, 4000),
        company_website: honeypot,
      });
      setStep("thanks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that note.");
    } finally {
      setBusy(false);
    }
  };

  const flow = (
    <div className={`ohq-flow${mode === "page" ? " ohq-flow-page" : ""}`}>
      <p className="ohq-kicker">Off-hours</p>
      {step === "intro" && (
        <>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            Forecast triage while sales is out
          </h2>
          <p className="ohq-lead">
            Six questions decide whether this is a fit. If it is, walk a sample forecast call:
            which deal closes, which is recoverable, which is a flat no. Leave a note. A person
            reads it in the morning.
          </p>
          <div className="ohq-actions">
            <button type="button" className="btn-primary" onClick={() => setStep("question")}>
              Start the six questions
            </button>
            {mode === "dock" && (
              <button type="button" className="btn-secondary" onClick={() => navigateApp("/qualify")}>
                Open full page
              </button>
            )}
          </div>
        </>
      )}

      {step === "question" && question && (
        <>
          <p className="ohq-progress">
            Question {questionIndex + 1} of {QUESTIONS.length}
          </p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            {question.prompt}
          </h2>
          {question.id === "pains" ? (
            <div className="ohq-options" role="group" aria-label={question.prompt}>
              {question.options.map((option) => {
                const selected = draft.pains.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={selected ? "ohq-option is-selected" : "ohq-option"}
                    aria-pressed={selected}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        pains: selected
                          ? current.pains.filter((pain) => pain !== option.value)
                          : [...current.pains, option.value],
                      }))
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ohq-options" role="group" aria-label={question.prompt}>
              {question.options.map((option) => {
                const selected = draft[question.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={selected ? "ohq-option is-selected" : "ohq-option"}
                    aria-pressed={selected}
                    onClick={() => setDraft((current) => ({ ...current, [question.id]: option.value }))}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="ohq-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (questionIndex === 0) setStep("intro");
                else setQuestionIndex(questionIndex - 1);
              }}
            >
              Back
            </button>
            <button type="button" className="btn-primary" disabled={!questionReady} onClick={goNextQuestion}>
              {questionIndex === QUESTIONS.length - 1 ? "See the fit" : "Continue"}
            </button>
          </div>
        </>
      )}

      {step === "result" && result && (
        <>
          <p className={`ohq-tier ohq-tier-${result.tier}`}>{tierLabel(result.tier)}</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            {result.headline}
          </h2>
          <p className="ohq-lead">{result.detail}</p>
          <dl className="ohq-facts">
            <div>
              <dt>Score</dt>
              <dd>{result.score} / 10</dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd>{result.buyerMatch}</dd>
            </div>
            <div>
              <dt>Angle</dt>
              <dd>{result.angle}</dd>
            </div>
          </dl>
          {result.signals.length > 0 && (
            <ul className="ohq-list">
              {result.signals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          )}
          {result.disqualifiers.length > 0 && (
            <ul className="ohq-list ohq-list-warn">
              {result.disqualifiers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <p className="ohq-next">{result.next}</p>
          <div className="ohq-actions">
            <button type="button" className="btn-primary" onClick={startDemo}>
              {result.tier === "bad-fit" ? "See the sample forecast" : "Walk the sample forecast"}
            </button>
            <button type="button" className="btn-secondary" onClick={leaveNote}>
              Leave a note
            </button>
            {showBooking && (
              <a className="btn-secondary ohq-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Book a 30-minute look
              </a>
            )}
            {onOpenPortal && (result.tier === "primary" || result.tier === "secondary") && (
              <button type="button" className="btn-secondary" onClick={onOpenPortal}>
                Test a stalled deal
              </button>
            )}
          </div>
        </>
      )}

      {step === "demo" && (
        <>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            Sample forecast call
          </h2>
          <p className="ohq-lead">
            Three rep-owned deals on the board. Sample deals. Your pipeline stays untouched.
          </p>
          {!demoStarted ? (
            <div className="ohq-actions">
              <button type="button" className="btn-primary" onClick={() => setDemoStarted(true)}>
                Run this forecast call
              </button>
            </div>
          ) : (
            <>
              <ol className="ohq-board">
                {DEMO_DEALS.slice(0, revealed).map((deal) => {
                  const isOpen = activeDeal === deal.id;
                  return (
                    <li key={deal.id}>
                      <button
                        type="button"
                        className={`ohq-deal ohq-deal-${deal.verdict}${isOpen ? " is-open" : ""}`}
                        aria-expanded={isOpen}
                        onClick={() => {
                          setActiveDeal(isOpen ? null : deal.id);
                          setOpened((current) => (current.includes(deal.id) ? current : [...current, deal.id]));
                        }}
                      >
                        <span className="ohq-deal-verdict">{deal.verdictLabel}</span>
                        <span className="ohq-deal-name">{deal.name}</span>
                        <span className="ohq-deal-meta">
                          {deal.owner} · {deal.amount} · {deal.stage}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="ohq-brief">
                          <p>{deal.blocker}</p>
                          <blockquote>{deal.quote}</blockquote>
                          <p>
                            <strong>This week.</strong> {deal.thisWeek}
                          </p>
                          {deal.inside30 && (
                            <p>
                              <strong>Inside 30 days.</strong> {deal.inside30}
                            </p>
                          )}
                          <pre className="ohq-crm">{deal.crm}</pre>
                          <button type="button" className="btn-secondary" onClick={() => void copyCrm(deal.id, deal.crm)}>
                            {copied === deal.id ? "Copied" : "Copy CRM note"}
                          </button>
                          {copyNotice && activeDeal === deal.id && copied !== deal.id && (
                            <p className="ohq-error" role="status">
                              {copyNotice}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {revealed >= DEMO_DEALS.length && opened.length >= DEMO_DEALS.length && (
                <p className="ohq-call-line" role="status">
                  {FORECAST_CALL_LINE}
                </p>
              )}
              {revealed >= DEMO_DEALS.length && opened.length < DEMO_DEALS.length && (
                <p className="ohq-next">Open each deal. The call is the judgment, not the stage name.</p>
              )}
            </>
          )}
          <div className="ohq-actions">
            <button type="button" className="btn-secondary" onClick={() => setStep("result")}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={leaveNote}>
              Leave this for the morning
            </button>
          </div>
        </>
      )}

      {step === "handoff" && result && (
        <>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            Leave this for the morning
          </h2>
          <p className="ohq-lead">
            {tierLabel(result.tier)}. Sales reads the note. Edit it if you want a person to know something
            the six questions missed.
          </p>
          <form className="ohq-form" onSubmit={(event) => void onSubmit(event)}>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </label>
            <label>
              <span>Work email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>Company</span>
              <input value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" />
            </label>
            <label className="ohq-hp" aria-hidden="true">
              <span>Company website</span>
              <input
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
              />
            </label>
            <label>
              <span>Note</span>
              <textarea
                required
                minLength={10}
                maxLength={4000}
                rows={8}
                value={note}
                onChange={(event) => {
                  setNoteTouched(true);
                  setNote(event.target.value);
                }}
              />
            </label>
            {error && (
              <p className="ohq-error" role="alert">
                {error}{" "}
                <a
                  href={contactMailto({
                    topic: "sales",
                    name,
                    email,
                    message: note,
                  })}
                >
                  Open your email app instead
                </a>
              </p>
            )}
            <div className="ohq-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep("demo")}>
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Sending…" : "Send to sales"}
              </button>
              {showBooking && (
                <a className="btn-secondary ohq-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                  Book a 30-minute look
                </a>
              )}
            </div>
          </form>
        </>
      )}

      {step === "thanks" && (
        <>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            Received.
          </h2>
          <p className="ohq-lead">Sales reads this in the morning. The sample call did not score a live deal.</p>
          <div className="ohq-actions">
            {showBooking && (
              <a className="btn-primary ohq-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Book a 30-minute look
              </a>
            )}
            <button type="button" className="btn-secondary" onClick={() => navigateApp("/")}>
              Back to the site
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (mode === "page") {
    return (
      <section className="ohq-page" aria-labelledby={titleId}>
        {flow}
      </section>
    );
  }

  return (
    <div className="ohq-dock">
      {open && (
        <div className="ohq-panel" role="dialog" aria-labelledby={titleId}>
          <button
            type="button"
            className="ohq-close"
            onClick={() => {
              setOpen(false);
              launchRef.current?.focus();
            }}
          >
            Close
          </button>
          {flow}
        </div>
      )}
      <button
        ref={launchRef}
        type="button"
        className="ohq-launch"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Off-hours triage
      </button>
    </div>
  );
}
