export type IntentExtractionStatus =
  | "represented"
  | "missing_despite_signals"
  | "unknown"
  | "explicit_refusal";

export interface IntentSignal {
  quote: string;
  kind: "interest" | "conditional_path" | "refusal";
}

export interface IntentExtractionAssessment {
  status: IntentExtractionStatus;
  signals: IntentSignal[];
  missing: IntentSignal[];
}

interface ForceEvidence {
  type?: string;
  weight?: number;
  evidence?: string;
}

const INTEREST =
  /\bi like what i (saw|heard)\b|\b(we are|we're) interested\b|\bi want to move forward\b|\bhasn'?t disappeared\b|\bstill looking\b|\b(don'?t|do not) think we should close the door\b|\bcomfortable bringing it back\b/i;
const CONDITIONAL =
  /\bwe can accelerate\b|\bif [^.\n]{0,48}\b(buys in|approves|signs off)\b/i;
const REFUSAL =
  /\b(not interested|will not buy|won't buy|decided not to (buy|proceed)|no longer pursuing)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function linesOf(transcript: string): string[] {
  return transcript
    .split(/\n+/)
    .map((line) => line.replace(/^\[[^\]]+\]\s*[A-Za-z]{1,8}:\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function collect(transcript: string, pattern: RegExp, kind: IntentSignal["kind"]): IntentSignal[] {
  const found: IntentSignal[] = [];
  for (const line of linesOf(transcript)) {
    if (!pattern.test(line)) continue;
    pattern.lastIndex = 0;
    if (found.some((item) => normalize(item.quote) === normalize(line))) continue;
    found.push({ quote: line, kind });
  }
  return found;
}

function quotesSignal(evidence: string, signal: IntentSignal): boolean {
  const evidenceText = normalize(evidence);
  const quote = normalize(signal.quote);
  if (!evidenceText || !quote) return false;
  if (evidenceText.includes(quote)) return true;
  if (evidenceText.length >= 24 && quote.includes(evidenceText)) return true;
  if (signal.kind === "interest") {
    return (
      evidenceText.includes("i like what i saw") ||
      evidenceText.includes("we are interested") ||
      evidenceText.includes("we re interested") ||
      evidenceText.includes("i want to move forward") ||
      evidenceText.includes("hasn t disappeared") ||
      evidenceText.includes("close the door") ||
      evidenceText.includes("still looking") ||
      evidenceText.includes("bringing it back")
    );
  }
  return evidenceText.includes("we can accelerate") || evidenceText.includes("buys in") || evidenceText.includes("signs off");
}

export function assessIntentExtraction(
  transcript: string,
  forces: ForceEvidence[]
): IntentExtractionAssessment {
  const willingness = [
    ...collect(transcript, INTEREST, "interest"),
    ...collect(transcript, CONDITIONAL, "conditional_path"),
  ];
  const refusals = willingness.length > 0 ? [] : collect(transcript, REFUSAL, "refusal");
  const intentForces = forces.filter(
    (force) => String(force.type ?? "").toLowerCase() === "intent" && Number(force.weight ?? 0) > 0
  );
  const missing = willingness.filter(
    (signal) => !intentForces.some((force) => quotesSignal(String(force.evidence ?? ""), signal))
  );
  const cited = willingness.length - missing.length;

  if (willingness.length === 0) {
    return {
      status: refusals.length > 0 ? "explicit_refusal" : "unknown",
      signals: refusals,
      missing: [],
    };
  }

  return {
    status: cited > 0 ? "represented" : "missing_despite_signals",
    signals: willingness,
    missing,
  };
}

export function buildIntentRetryInstructions(missing: IntentSignal[]): string {
  const quotes = missing.map((signal) => `- "${signal.quote}"`).join("\n");
  return `YOUR PRIOR OUTPUT OMITTED INTENT WHILE THE BUYER STATED WILLINGNESS.

These buyer statements are in the transcript and were not quoted by an Intent force:
${quotes}

Return the full JSON again.
- Add one Intent force. Its evidence must be one of those sentences, copied from the transcript.
- You choose the weight from how conditional the statement is. Do not use zero. Do not copy a weight from these instructions.
- A missing approver, an unmet technical requirement, or "I'm not moving this forward" without that approver stays Constraint or Structural. That sentence is not Intent and it is not a refusal.
- Omit Intent only when the buyer neither states willingness nor refuses. That is not this transcript.
- Do not invent quotes, dates, or amounts.`;
}
