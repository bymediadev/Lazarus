import { FormEvent, lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AnalysisCaptcha from "../components/AnalysisCaptcha";
import { navigateApp, scrollToSection } from "../lib/appRoute";
import { API_BASE, PostMortemApiError, runPostMortem, type PostMortemResponse } from "../lib/api";
import { bakedCaptchaSiteKey } from "../lib/captcha";
import { contactMailto, sendContactNote } from "../lib/contact";
import { BOOKING_URL, COMPANY_LINKEDIN, FOUNDER_EMAIL, FOUNDER_LINKEDIN, FOUNDER_NAME } from "../lib/site";
import { DEMO_DEALS } from "./deals";
import { answerFaq } from "./faq";
import { findRedactions, redactTranscript, redactionCounts, type RedactionSpan } from "./redact";
import {
  bookingSlotFromMessage,
  forecastInstant,
  formatSlot,
  guessMeetingZone,
  isOpenSlot,
  slotsBeforeForecast,
  type MeetingZoneId,
} from "./slots";
import TeamMeetingPicker from "./TeamMeetingPicker";
import { exportQualifierBundle } from "./export";
import { readTeaser, type DealTeaser } from "./teaser";

const AnalysisReport = lazy(() => import("../components/AnalysisReport"));
import type { Arrival } from "./arrival";
import { companyDomain, preCallBrief } from "./brief";
import {
  CHECKPOINT_DIRECTIVE,
  EMPTY_GATES,
  FLAT_NO_DIRECTIVE,
  gateSummary,
  HOLD_COPY,
  morningAllowed,
  routeContext,
  routeIntegrity,
  type GateAnswers,
  type HoldReason,
  type RouteNotice,
} from "./gates";

type Stage = "gate" | "hold" | "stop" | "tour" | "paste" | "review" | "scoring" | "teaser" | "booked";
type ViewChoice = "results" | "walkthrough";

const TEXT_EXT = [".txt", ".md", ".csv"];
const MAX_CHARS = 80_000;

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function embedUrl(): string {
  const viteEnv = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env;
  return (viteEnv?.VITE_CAL_EMBED_URL ?? "").trim();
}

function leadMessage(input: {
  name: string;
  company: string;
  teaser: DealTeaser | null;
  slotLabel: string;
  view: ViewChoice;
  includePlan: boolean;
  fit: string;
}): string {
  const lines = [
    "Off-hours redacted deal",
    "",
    `Name: ${input.name.trim() || "—"}`,
    `Company: ${input.company.trim() || "—"}`,
    `View: ${input.view === "results" ? "See results now" : "Walk through on the call"}`,
    input.fit,
    `Slot: ${input.slotLabel}`,
    "Transcript was redacted in the browser and was not attached.",
  ];
  if (input.teaser) {
    lines.push(
      `Verdict: ${input.teaser.verdict}`,
      `Deal risk: ${input.teaser.risk ?? "—"}`,
      `Blocker: ${input.teaser.blocker}`,
      `Quote: ${input.teaser.quote}`
    );
    if (input.includePlan) {
      lines.push("", "0–7 day plan:");
      if (input.teaser.thisWeek.length === 0) lines.push("- None returned");
      else input.teaser.thisWeek.forEach((line) => lines.push(`- ${line}`));
    }
  }
  return lines.join("\n").slice(0, 4000);
}

function EngineReport({ report, titleId }: { report: PostMortemResponse; titleId?: string }) {
  return (
    <div className="ohq-report panel panel-right">
      <div className="panel-label report-panel-label" id={titleId} tabIndex={-1}>
        Deal Score &amp; Recovery Brief
      </div>
      <Suspense fallback={<p className="ohq-lead">Opening the report…</p>}>
        <AnalysisReport result={report} sources={report.sources} />
      </Suspense>
    </div>
  );
}

function ExportReview({ onExport }: { onExport: () => void }) {
  return (
    <div className="ohq-export">
      <p className="ohq-lead">
        Download the full local read — fit gates, speakers, purchase motion, timeline, redaction, teaser, and the engine
        report — as Markdown and JSON.
      </p>
      <div className="ohq-actions">
        <button type="button" className="btn-secondary" onClick={onExport}>
          Export this qualifier run
        </button>
      </div>
    </div>
  );
}

function openPricing(): void {
  if (document.getElementById("pricing")) {
    scrollToSection("pricing");
    return;
  }
  navigateApp("/");
  window.setTimeout(() => scrollToSection("pricing"), 60);
}

function FitAnswers() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = (text: string) => {
    const next = text.trim();
    setQuestion(next);
    setAnswer(answerFaq(next).answer);
  };
  return (
    <form
      className="ohq-form"
      onSubmit={(event) => {
        event.preventDefault();
        ask(question);
      }}
    >
      <p className="ohq-progress">Ask a question here. This does not book a meeting.</p>
      <div className="ohq-actions">
        {["Pricing", "Transcript format", "Is this the right fit?"].map((chip) => (
          <button key={chip} type="button" className="btn-secondary" onClick={() => ask(chip)}>
            {chip}
          </button>
        ))}
      </div>
      <label>
        <span>Question</span>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which plan fits?"
        />
      </label>
      <button type="submit" className="btn-secondary">
        Answer from the site
      </button>
      {answer && <p className="ohq-call-line">{answer}</p>}
    </form>
  );
}

function RedactionPreview({ text, spans }: { text: string; spans: RedactionSpan[] }) {
  if (spans.length === 0) return null;
  const nodes = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) nodes.push(<span key={`t${index}`}>{text.slice(cursor, span.start)}</span>);
    nodes.push(
      <mark key={`m${index}`} className={`ohq-mark ohq-mark-${span.kind}`}>
        {text.slice(span.start, span.end)}
      </mark>
    );
    cursor = span.end;
  });
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  return <p className="ohq-highlight">{nodes}</p>;
}

type Props = {
  active: boolean;
  arrival?: Arrival;
  onOpenPortal?: () => void;
};

export default function OffHoursFunnel({ active, arrival = "site", onOpenPortal }: Props) {
  const titleId = useId();
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const [stage, setStage] = useState<Stage>("gate");
  const [companyUrl, setCompanyUrl] = useState("");
  const [accountName, setAccountName] = useState("");
  const [acvText, setAcvText] = useState("");
  const [screen, setScreen] = useState<"context" | "integrity">("context");
  const [ownershipChoice, setOwnershipChoice] = useState("");
  const [dropChoice, setDropChoice] = useState("");
  const [notice, setNotice] = useState<RouteNotice | null>(null);
  const [commitment, setCommitment] = useState<boolean | null>(null);
  const [forecastInput, setForecastInput] = useState("");
  const [meetingZone, setMeetingZone] = useState<MeetingZoneId>(() => guessMeetingZone());
  const [gateAnswers, setGateAnswers] = useState<GateAnswers>(EMPTY_GATES);
  const [access, setAccess] = useState<"pending" | "report" | "stop" | "calendar">("pending");
  const [hold, setHold] = useState<HoldReason | null>(null);
  const [beat, setBeat] = useState(0);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [redacted, setRedacted] = useState("");
  const [spans, setSpans] = useState<RedactionSpan[]>([]);
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [counts, setCounts] = useState({ name: 0, company: 0, amount: 0 });
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PostMortemResponse | null>(null);
  const [teaser, setTeaser] = useState<DealTeaser | null>(null);
  const [view, setView] = useState<ViewChoice>("results");
  const [unlocked, setUnlocked] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [slotLimit, setSlotLimit] = useState(12);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const onCaptcha = useCallback((token: string) => setCaptchaToken(token), []);
  const exportRun = useCallback(() => {
    exportQualifierBundle({
      arrival,
      stage,
      companyUrl,
      accountName,
      acvText,
      forecastInput,
      meetingZone,
      gateAnswers,
      access,
      hold,
      commitment,
      sourceTranscript: source,
      redactedTranscript: redacted,
      spans,
      teaser,
      report,
      noticeTitle: notice?.title ?? null,
      noticeBody: notice?.body ?? null,
    });
  }, [
    arrival,
    stage,
    companyUrl,
    accountName,
    acvText,
    forecastInput,
    meetingZone,
    gateAnswers,
    access,
    hold,
    commitment,
    source,
    redacted,
    spans,
    teaser,
    report,
    notice,
  ]);
  const forecastAt = useMemo(() => forecastInstant(forecastInput, meetingZone), [forecastInput, meetingZone]);
  const slots = useMemo(
    () => (forecastAt ? slotsBeforeForecast(forecastAt, new Date(), slotLimit) : []),
    [forecastAt, slotLimit, calendarOpen]
  );
  const calUrl = embedUrl();

  useEffect(() => {
    if (stage !== "review") return;
    let cancelled = false;
    void fetch(`${API_BASE}/api/runtime`)
      .then((res) => res.json())
      .then((data: { captcha?: { required?: boolean; site_key?: string | null } }) => {
        if (cancelled) return;
        setCaptchaRequired(Boolean(data.captcha?.required));
        setCaptchaSiteKey(String(data.captcha?.site_key ?? bakedCaptchaSiteKey()));
      })
      .catch(() => {
        if (!cancelled) setCaptchaSiteKey(bakedCaptchaSiteKey());
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onMessage = (event: MessageEvent) => {
      const parsed = bookingSlotFromMessage(event.data);
      if (!parsed) return;
      if ("refused" in parsed) {
        setError("That time is outside weekday mornings. Saturday and Sunday are closed.");
        return;
      }
      setSlotIso(parsed.iso);
      setError(null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [calendarOpen]);

  const prepareReview = () => {
    const text = transcript.trim().slice(0, MAX_CHARS);
    if (text.length < 40) {
      setError("Paste a stalled-call transcript. A few lines is not enough to score.");
      return;
    }
    setSource(text);
    const next = redactTranscript(text);
    setRedacted(next.text);
    setSpans(next.spans);
    setCounts(redactionCounts(next.spans));
    setConfirmed(false);
    setError(null);
    setStage("review");
  };

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith("audio") || file.type.startsWith("video")) {
      setError(
        "Paste the transcript. Audio is not sent from here, so names and amounts can be redacted before anything leaves the browser."
      );
      return;
    }
    const ext = extension(file.name);
    if (!TEXT_EXT.includes(ext) && !file.type.startsWith("text")) {
      setError("Use a .txt, .md, or .csv transcript, or paste the text.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("That file is over 1 MB. Paste the stalled portion.");
      return;
    }
    const text = (await file.text()).trim();
    setTranscript(text.slice(0, MAX_CHARS));
    setError(null);
  };

  const runScore = async () => {
    if (access === "pending" || access === "stop") {
      setError("Answer the fit questions before this call is scored.");
      setStage(access === "stop" ? "stop" : "gate");
      return;
    }
    if (!confirmed) {
      setError("Confirm the redacted text before it is sent.");
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError(
        captchaSiteKey
          ? "Complete the security check before the score runs."
          : "Security check is not available. Refresh the page and try again."
      );
      return;
    }
    setStage("scoring");
    setError(null);
    try {
      const domain = companyDomain(companyUrl) ?? undefined;
      const result = await runPostMortem({
        transcript: redacted,
        dealValue: "0",
        captchaToken: captchaToken || undefined,
        offHours: true,
        companyUrl: companyUrl.trim() || undefined,
        accountName: accountName.trim() || undefined,
        amountAtRisk: acvText.trim() || undefined,
        accountId: domain,
      });
      setReport(result);
      setTeaser(readTeaser(result));
      setView("results");
      setStage("teaser");
    } catch (err) {
      setStage("review");
      setCaptchaToken("");
      setCaptchaReset((n) => n + 1);
      if (err instanceof PostMortemApiError && err.relevance?.label === "not_sales") {
        setError("That text did not read as a stalled deal, so it was not scored.");
        return;
      }
      const message = err instanceof Error ? err.message : "The score did not finish.";
      setError(
        /failed \(5\d\d\)|Failed to fetch|NetworkError/i.test(message)
          ? "The scoring service did not answer. The redacted text is still here."
          : message
      );
    }
  };

  const book = async (event: FormEvent) => {
    event.preventDefault();
    const slot = slots.find((item) => item.iso === slotIso) ?? null;
    const when = slotIso ? new Date(slotIso) : null;
    if (!teaser || !morningAllowed(teaser.verdict, access, commitment === true)) {
      setError("A dead deal does not get a meeting. Take it off the list.");
      return;
    }
    if (!forecastAt || !slots.some((slot) => slot.iso === slotIso)) {
      setError("Pick a time in the two days before your team meets.");
      return;
    }
    if (!when || Number.isNaN(when.getTime()) || !isOpenSlot(when)) {
      setError("Pick a weekday morning. Saturday and Sunday are closed.");
      return;
    }
    const slotLabel = slot?.label ?? formatSlot(when);
    setBusy(true);
    setError(null);
    const domain = companyDomain(companyUrl) ?? "";
    const fit = `${gateSummary(gateAnswers, accountName, acvText)}\nCompany URL: ${domain || "—"}`;
    const leadBody = {
      name,
      email,
      company,
      company_website: honeypot,
      company_url: domain,
      slot_iso: when.toISOString(),
      slot_label: slotLabel,
      forecast_label: formatSlot(forecastAt, meetingZone),
      view,
      verdict: teaser?.verdict ?? "",
      risk: teaser?.risk,
      blocker: teaser?.blocker ?? "",
      quote: teaser?.quote ?? "",
      this_week: teaser?.thisWeek ?? [],
      fit,
      account_name: accountName,
      acv_plain: acvText,
    };
    try {
      let profile = "The site did not answer.";
      const lead = await fetch(`${API_BASE}/api/off-hours/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadBody),
      });
      const leadData = (await lead.json().catch(() => ({}))) as { error?: string; profile?: string };
      if (!lead.ok) throw new Error(leadData.error || "Could not save that booking.");
      if (leadData.profile) profile = leadData.profile;
      const message = [
        preCallBrief({
          domain,
          profile,
          account: accountName,
          acv: acvText,
          owner: name,
          forecastLabel: formatSlot(forecastAt, meetingZone),
          slotLabel,
          verdict: teaser.verdict,
          blocker: teaser.blocker,
        }),
        "",
        leadMessage({
          name,
          company,
          teaser,
          slotLabel,
          view,
          includePlan: view === "results",
          fit,
        }),
      ]
        .join("\n")
        .slice(0, 4000);
      await sendContactNote({
        topic: "sales",
        name: name.trim(),
        email: email.trim(),
        message,
        company_website: honeypot,
      });
      setUnlocked(view === "results");
      setStage("booked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that booking.");
      if (view === "results") setUnlocked(true);
      setStage("booked");
    } finally {
      setBusy(false);
      setCalendarOpen(false);
    }
  };

  useEffect(() => {
    if (stage === "paste") transcriptRef.current?.focus();
  }, [stage]);

  const submitContext = (event: FormEvent) => {
    event.preventDefault();
    const domain = companyDomain(companyUrl);
    if (!domain) {
      setError("Enter the company website, like harborlogistics.com.");
      return;
    }
    const result = routeContext({
      account: accountName,
      amount: acvText,
      forecastAt,
    });
    if (result.missing) {
      setError(result.missing);
      return;
    }
    if (!company.trim()) setCompany(domain);
    setNotice(result.title ? result : null);
    setAccess(result.next === "integrity" ? "pending" : "report");
    setHold(result.reason === "small-acv" ? "small-acv" : null);
    setGateAnswers({ ...EMPTY_GATES, acv: result.amount != null && result.amount >= 25_000 ? "over-25k" : "under-25k" });
    setError(null);
    if (result.next === "integrity") {
      setScreen("integrity");
      return;
    }
    setStage("paste");
  };

  const submitIntegrity = (event: FormEvent) => {
    event.preventDefault();
    const result = routeIntegrity(ownershipChoice, dropChoice);
    if (result.missing) {
      setError(result.missing);
      return;
    }
    setNotice(result);
    setAccess(result.access);
    setHold(result.reason === "ownership" || result.reason === "keep-dead" ? result.reason : null);
    setGateAnswers((prev) => ({
      ...prev,
      ownership: ownershipChoice === "yes" ? "yes" : "no",
      drop: dropChoice === "yes" ? "yes" : "no",
    }));
    setError(null);
    setStage("paste");
  };

  const leftover = findRedactions(redacted).length > 0;

  return (
    <div className="ohq-flow">
      <p className="ohq-kicker">
        {arrival === "linkedin" ? "LinkedIn" : arrival === "email" ? "From the note" : "Off-hours"}
      </p>

      {stage === "gate" && screen === "context" && (
        <form className="ohq-form" onSubmit={submitContext}>
          <p className="ohq-progress">First</p>
          <h2 id={titleId} tabIndex={-1}>
            The deal, and your team meeting.
          </h2>
          <p className="ohq-lead">
            We keep the website, the deal name, and the dollar amount for our notes. We do not put them in the call text. We do not send them to the score.
          </p>
          <label>
            <span>Company URL</span>
            <input
              value={companyUrl}
              onChange={(event) => setCompanyUrl(event.target.value)}
              placeholder="harborlogistics.com"
              required
              autoComplete="url"
            />
          </label>
          <label>
            <span>Account</span>
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} required />
          </label>
          <label>
            <span>Amount at risk</span>
            <input
              value={acvText}
              onChange={(event) => setAcvText(event.target.value)}
              placeholder="80000"
              required
            />
          </label>
          <TeamMeetingPicker
            value={forecastInput}
            zone={meetingZone}
            onChange={setForecastInput}
            onZoneChange={setMeetingZone}
          />
          <p className="ohq-lead">
            This is your own team meeting, where you decide which deals will close. Pick your time zone, the day, and the time.
          </p>
          {error && <p className="ohq-error">{error}</p>}
          <button type="submit" className="btn-primary">
            Continue
          </button>
          <FitAnswers />
        </form>
      )}

      {stage === "gate" && screen === "integrity" && (
        <form className="ohq-form" onSubmit={submitIntegrity}>
          <p className="ohq-progress">Two answers</p>
          <h2 id={titleId} tabIndex={-1}>
            Two questions.
          </h2>
          <fieldset className="ohq-options">
            <legend>Do you own the sales number your team has to hit?</legend>
            {[
              ["yes", "Yes. I own that number."],
              ["no", "No. Someone else owns it."],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={ownershipChoice === id ? "ohq-option is-selected" : "ohq-option"}
                aria-pressed={ownershipChoice === id}
                onClick={() => setOwnershipChoice(id)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <fieldset className="ohq-options">
            <legend>If this deal is dead, will you take it off the list this week?</legend>
            {[
              ["yes", "Yes. I will take it off."],
              ["no", "No. I will leave it on the list."],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={dropChoice === id ? "ohq-option is-selected" : "ohq-option"}
                aria-pressed={dropChoice === id}
                onClick={() => setDropChoice(id)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          {error && <p className="ohq-error">{error}</p>}
          <div className="ohq-actions">
            <button type="button" className="btn-secondary" onClick={() => setScreen("context")}>
              Back
            </button>
            <button type="submit" className="btn-primary">
              Continue
            </button>
          </div>
        </form>
      )}

      {(stage === "hold" || stage === "stop") && hold && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            {notice?.title || HOLD_COPY[hold].title}
          </h2>
          <p className="ohq-lead">{notice?.body || HOLD_COPY[hold].body}</p>
          <div className="ohq-actions">
            {(notice ? notice.allowScore : HOLD_COPY[hold].allowScore) && (
              <button type="button" className="btn-primary" onClick={() => setStage("paste")}>
                Score this call
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={openPricing}>
              See pricing
            </button>
            {onOpenPortal && (
              <button type="button" className="btn-secondary" onClick={onOpenPortal}>
                Test a stalled deal
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={() => setStage("gate")}>
              Back
            </button>
          </div>
          <FitAnswers />
        </>
      )}

      {stage === "tour" && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            {beat === 0 && "Deals get stuck in crowds."}
            {beat === 1 && "Sort the pipeline before the forecast."}
            {beat === 2 && "Pricing, security, and CRM."}
          </h2>
          {beat === 0 && (
            <p className="ohq-lead">
              {arrival === "linkedin" && "You clicked through from LinkedIn. "}
              {arrival === "email" && "You opened this from the note. "}
              The CRM still shows one close date. It does not show who is missing, who can block the
              deal, or whether it is still worth the next call.
            </p>
          )}
          {beat === 1 && (
            <>
              <p className="ohq-lead">
                Categorize a stalled deal as recoverable, a checkpoint, or a flat no. Then the next
                action. These three are samples. Your transcript comes next, and it is redacted
                before it is sent.
              </p>
              <ul className="ohq-board">
                {DEMO_DEALS.map((deal) => (
                  <li key={deal.id} className={`ohq-deal ohq-deal-${deal.verdict}`}>
                    <span className="ohq-deal-verdict">{deal.verdictLabel}</span>
                    <span className="ohq-deal-name">{deal.name}</span>
                    <span className="ohq-deal-meta">{deal.blocker}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {beat === 2 && (
            <>
              <p className="ohq-lead">
                Answers come from the published pages. This does not negotiate price.
              </p>
              <div className="ohq-actions">
                {["Pricing", "Security", "HubSpot and Salesforce"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setFaqQuestion(chip);
                      setFaqAnswer(answerFaq(chip).answer);
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <form
                className="ohq-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFaqAnswer(answerFaq(faqQuestion).answer);
                }}
              >
                <label>
                  <span>Question</span>
                  <input
                    value={faqQuestion}
                    onChange={(event) => setFaqQuestion(event.target.value)}
                    placeholder="What does a report cost?"
                  />
                </label>
                <button type="submit" className="btn-secondary">
                  Answer from the site
                </button>
              </form>
              {faqAnswer && <p className="ohq-call-line">{faqAnswer}</p>}
            </>
          )}
          <div className="ohq-actions">
            {beat > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setBeat(beat - 1)}>
                Back
              </button>
            )}
            {beat < 2 ? (
              <button type="button" className="btn-primary" onClick={() => setBeat(beat + 1)}>
                Continue
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setStage("paste")}>
                Redact a stalled transcript
              </button>
            )}
          </div>
        </>
      )}

      {stage === "paste" && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            Paste the stalled call
          </h2>
          {notice && (
            <p className="ohq-call-line">
              {notice.title} {notice.body}
            </p>
          )}
          <p className="ohq-lead">
            {arrival === "linkedin" && "You clicked through from LinkedIn. "}
            {arrival === "email" && "You opened this from the note. "}
            Names, companies, and amounts are replaced in this browser. You read the redacted text
            before it is sent. A recording stays on Test a Stalled Deal.
          </p>
          <label className="ohq-drop">
            <span>Transcript</span>
            <textarea
              ref={transcriptRef}
              rows={8}
              value={transcript}
              maxLength={MAX_CHARS}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Paste the call, or drop a .txt file."
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void takeFile(event.dataTransfer.files?.[0]);
              }}
            />
            <input
              type="file"
              accept=".txt,.md,.csv,text/plain"
              onChange={(event) => void takeFile(event.target.files?.[0])}
            />
          </label>
          {error && <p className="ohq-error">{error}</p>}
          <div className="ohq-actions">
            <button type="button" className="btn-secondary" onClick={() => setStage(hold ? "hold" : "gate")}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={prepareReview}>
              Redact in the browser
            </button>
          </div>
        </>
      )}

      {stage === "review" && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            Review the redacted text
          </h2>
          <p className="ohq-lead">
            Replaced {counted(counts.name, "name", "names")}, {counted(counts.company, "company", "companies")}, and{" "}
            {counted(counts.amount, "amount", "amounts")}.
            Edit anything that should still be hidden.
          </p>
          <RedactionPreview text={source} spans={spans} />
          <label className="ohq-form">
            <span>Text that will be sent</span>
            <textarea rows={8} value={redacted} onChange={(event) => setRedacted(event.target.value)} />
          </label>
          {leftover && (
            <p className="ohq-next">A name, company, or amount may still be in the text. Read it again.</p>
          )}
          <label className="ohq-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Send this redacted text. The original stays in the browser.
          </label>
          {captchaRequired && captchaSiteKey && (
            <AnalysisCaptcha siteKey={captchaSiteKey} resetKey={captchaReset} onToken={onCaptcha} />
          )}
          {error && <p className="ohq-error">{error}</p>}
          <div className="ohq-actions">
            <button type="button" className="btn-secondary" onClick={() => setStage("paste")}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={() => void runScore()}>
              Score the redacted deal
            </button>
          </div>
        </>
      )}

      {stage === "scoring" && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            Scoring the redacted transcript
          </h2>
          <p className="ohq-lead" role="status">
            The deal engine is reading what you confirmed, plus the company site and amount you typed. The original
            text was not attached.
          </p>
        </>
      )}

      {stage === "teaser" && teaser && (
        <>
          {report?.company_context && (
            <p className="ohq-lead">
              Looking at {report.company_context.domain || "this account"}
              {report.company_context.account && report.company_context.account !== "—"
                ? ` — ${report.company_context.account}`
                : ""}
              {report.company_context.amount && report.company_context.amount !== "—"
                ? ` (${report.company_context.amount})`
                : ""}
              . {report.company_context.profile}
            </p>
          )}
          {teaser.verdict === "Flat no" && <p className="ohq-next">{FLAT_NO_DIRECTIVE}</p>}
          {teaser.verdict === "Checkpoint" && <p className="ohq-next">{CHECKPOINT_DIRECTIVE}</p>}
          {teaser.verdict === "Recoverable" && access !== "calendar" && (
            <p className="ohq-next">You get the report. A meeting with us stays closed.</p>
          )}
          {teaser.verdict === "Recoverable" && access === "calendar" && commitment == null && forecastAt && (
            <div className="ohq-actions">
              <p className="ohq-lead">
                Do this before your team meets on {formatSlot(forecastAt, meetingZone)}: “
                {teaser.thisWeek[0] || teaser.blocker}”. Will you do that before the meeting?
              </p>
              <button type="button" className="btn-primary" onClick={() => setCommitment(true)}>
                Yes. I will do it before my team meets.
              </button>
              <button type="button" className="btn-secondary" onClick={() => setCommitment(false)}>
                No. I only want the report.
              </button>
            </div>
          )}
          {teaser.verdict === "Recoverable" && access === "calendar" && commitment === false && (
            <p className="ohq-next">You get the report. A meeting with us stays closed.</p>
          )}
          {morningAllowed(teaser.verdict, access, commitment === true) && (
            <>
              {slots.length === 0 && (
                <p className="ohq-next">
                  There is no open 15-minute time in the two days before your team meets.
                </p>
              )}
              {slots.length > 0 && (
                <div className="ohq-actions">
                  <button type="button" className="btn-primary" onClick={() => setCalendarOpen(true)}>
                    Pick a 15-minute time with us, before your team meets
                  </button>
                </div>
              )}
            </>
          )}
          {report && (
            <>
              <ExportReview onExport={exportRun} />
              <EngineReport report={report} titleId={titleId} />
            </>
          )}
        </>
      )}

      {stage === "booked" && (
        <>
          <h2 id={titleId} tabIndex={-1}>
            Booked
          </h2>
          {error && (
            <p className="ohq-error">
              {error}{" "}
              <a
                href={contactMailto({
                  topic: "sales",
                  name,
                  email,
                  message: leadMessage({
                    name,
                    company,
                    teaser,
                    slotLabel: slotIso ? formatSlot(new Date(slotIso)) : "Weekday morning",
                    view,
                    includePlan: view === "results",
                    fit: gateSummary(gateAnswers, accountName, acvText),
                  }),
                })}
              >
                Open your email app instead
              </a>
            </p>
          )}
          <p className="ohq-lead">
            Your meeting with {FOUNDER_NAME} is booked. The note goes to{" "}
            <a href={`mailto:${FOUNDER_EMAIL}`}>{FOUNDER_EMAIL}</a>.{" "}
            <a href={COMPANY_LINKEDIN} target="_blank" rel="noopener noreferrer">
              Company LinkedIn
            </a>
            , then{" "}
            <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer">
              Joshua Bennett
            </a>
            . The report is below.
          </p>
          {report && (
            <>
              <ExportReview onExport={exportRun} />
              <EngineReport report={report} />
            </>
          )}
          <div className="ohq-actions">
            {onOpenPortal && (
              <button type="button" className="btn-secondary" onClick={onOpenPortal}>
                Test a stalled deal
              </button>
            )}
          </div>
        </>
      )}

      {active && calendarOpen && teaser && morningAllowed(teaser.verdict, access, commitment === true) &&
        createPortal(
          <div className="ohq-modal" role="dialog" aria-modal="true" aria-labelledby="ohq-cal-title">
            <div className="ohq-modal-card">
              <button type="button" className="ohq-close" onClick={() => setCalendarOpen(false)}>
                Close
              </button>
              <h2 id="ohq-cal-title">Times with us</h2>
              <p className="ohq-lead">
                These are meetings with {FOUNDER_NAME}, before your team meets. Monday to Friday. 8 in the morning until 12 noon, and 2 in the afternoon. Shown in New York time. Saturday and Sunday are closed. The note goes to{" "}
                <a href={`mailto:${FOUNDER_EMAIL}`}>{FOUNDER_EMAIL}</a>.{" "}
                <a href={COMPANY_LINKEDIN} target="_blank" rel="noopener noreferrer">
                  Company LinkedIn
                </a>
                , then{" "}
                <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer">
                  Joshua Bennett
                </a>
                .
              </p>
              <div className="ohq-slots">
                {slots.map((slot) => (
                  <button
                    key={slot.iso}
                    type="button"
                    className={slot.iso === slotIso ? "ohq-option is-selected" : "ohq-option"}
                    aria-pressed={slot.iso === slotIso}
                    onClick={() => setSlotIso(slot.iso)}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              {slotLimit < 16 && (
                <button type="button" className="btn-secondary" onClick={() => setSlotLimit(16)}>
                  More mornings
                </button>
              )}
              <form className="ohq-form" onSubmit={(event) => void book(event)}>
                <label>
                  <span>Name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
                </label>
                <label>
                  <span>Work email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  <span>Company</span>
                  <input value={company} onChange={(event) => setCompany(event.target.value)} autoComplete="organization" />
                </label>
                <label className="ohq-hp" aria-hidden="true">
                  <span>Company website</span>
                  <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
                </label>
                {error && <p className="ohq-error">{error}</p>}
                <div className="ohq-actions">
                  <button type="submit" className="btn-primary" disabled={busy || !slotIso}>
                    {busy ? "Sending…" : view === "results" ? "Book and unlock the plan" : "Book the walkthrough"}
                  </button>
                  <a className="btn-secondary ohq-link" href={calUrl || BOOKING_URL} target="_blank" rel="noopener noreferrer">
                    Open Joshua&apos;s calendar
                  </a>
                </div>
              </form>
              {calUrl && (
                <iframe
                  className="ohq-cal-frame"
                  title="Weekday morning calendar"
                  src={calUrl}
                />
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
