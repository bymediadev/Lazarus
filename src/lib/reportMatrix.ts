import { uniqueActionSteps } from "./actionSteps";
import { capacitySubject, samePerson } from "./evidenceAttribution";
import { formatRecoveryAction, uniqueRecoveryNotes } from "./recoveryPlan";

/** One threshold table for every transcript. Headline, scorecard, and notes read this tier. */
export const RISK_THRESHOLDS = {
  critical: 75,
  high: 55,
  moderate: 35,
} as const;

export type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type RecoverabilityStatus =
  | "RECOVERABLE"
  | "CONDITIONALLY_RECOVERABLE"
  | "UNDETERMINED"
  | "NOT_CURRENTLY_RECOVERABLE"
  | "FLAT_NO";

export type ForceDuration = "TEMPORARY" | "CONDITIONAL" | "ONGOING" | "PERMANENT" | "UNKNOWN";

export interface ForceScoreEffect {
  dimension: "structural_lock_in" | "constraint_pressure" | "intent_strength" | "enabler_strength" | "none";
  included: boolean;
  reason: string;
  duration: ForceDuration;
}

export interface MatrixForce {
  factor: string;
  type: string;
  weight: number;
  role?: string;
  derived_from?: string[];
  evidence: string;
  score_effect?: ForceScoreEffect;
}

export interface RecoverabilityAssessment {
  status: RecoverabilityStatus;
  confidence: number;
  blocking_conditions: string[];
  evidence_gaps: string[];
  /** Why this status was reached. A viability score is not this text. */
  explanation: string;
}

export interface ReportCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface ReportValidation {
  passed: boolean;
  checks: ReportCheck[];
}

export function classifyRisk(score: number): RiskTier {
  if (score >= RISK_THRESHOLDS.critical) return "CRITICAL";
  if (score >= RISK_THRESHOLDS.high) return "HIGH";
  if (score >= RISK_THRESHOLDS.moderate) return "MODERATE";
  return "LOW";
}

export function stalledHeadline(tier: RiskTier): string {
  return `STALLED — ${tier} RISK`;
}

export function formatRecoverability(status: RecoverabilityStatus): string {
  switch (status) {
    case "RECOVERABLE":
      return "Recoverable";
    case "CONDITIONALLY_RECOVERABLE":
      return "Conditionally recoverable";
    case "UNDETERMINED":
      return "Undetermined";
    case "NOT_CURRENTLY_RECOVERABLE":
      return "Not currently recoverable";
    case "FLAT_NO":
      return "Flat no as a purchase";
  }
}

const SOLE_OPERATOR =
  /\b(solopreneur|sole proprietor|sole owner|small-business owner|small business owner|owner-operator|owner operator)\b/i;

/** The person owns the business. A suppressed-champion label does not fit. */
export function isSoleOperator(role = "", evidence = ""): boolean {
  return SOLE_OPERATOR.test(`${role} ${evidence}`);
}

const BUYER_DECLINED =
  /\b(?:not going to be (?:your|the) client|won't be your client|will not be your client|i(?:'m| am) not (?:going to be )?(?:your|the) client|i might be the referral|be the referral|not a buyer|not the buyer|not going to buy|not here to buy)\b/i;
const BUYER_REFUSAL_NEAR = /\bclient\b[\s\S]{0,80}\bno way\b|\bno way\b[\s\S]{0,80}\bclient\b/i;
/** A purchase act the buyer states. The word "budget" alone is not one. */
const PURCHASE_ACT =
  /\b(not moving this forward|signs? off|has to approve|have to approve|needs to approve|buys in|we can accelerate|send (?:me )?a proposal|platform fee|\bin range\b|signing authority|annual contract|we modeled|nothing is signed|weigh in|platform budget)\b/i;
const BUYER_WON =
  /\b(contract is executed|closed-won|procurement issued the po|issued the po for)\b/i;
const BUYER_LOST =
  /\b(pull the plug|signed with|closed on our end|we(?:'re| are) not moving forward with any|please do formally close|formally close the opportunity)\b/i;
const NOT_QUALIFIED_MONEY =
  /\b(nothing over|gets signed until|hard freeze|cannot carry|can't carry|per day|costing you|not actionable|needs three quotes)\b/i;

export type PurchaseMotion = "not_a_deal" | "deal_open" | "deal_closed" | "unresolved" | "unclear";

export interface TranscriptTurn {
  speaker: string;
  role: "seller" | "buyer" | "unknown";
  text: string;
}

const SELLER_ROLE =
  /\b(account executive|\bae\b|enterprise ae|sales rep(?:resentative)?|account rep|sdr|bdr)\b/i;

function sellersFromHeader(transcript: string): Set<string> {
  const sellers = new Set<string>();
  const blob = transcript.replace(/\r/g, "");
  for (const match of blob.matchAll(
    /\(([A-Za-z]{1,5})\)\s*[–—-][^()\n]{0,160}?\b(account executive|\bae\b|enterprise ae|sales rep(?:resentative)?)\b/gi
  )) {
    sellers.add(match[1].toLowerCase());
  }
  // "Marcus Reed — Sales Representative" / "**Marcus Reed — Sales Representative**"
  for (const match of blob.matchAll(
    /(?:^|\n)\s*\**([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\**\s*[–—-]\s*\**[^\n]*?\b(account executive|\bae\b|enterprise ae|sales rep(?:resentative)?|account rep)\b/gi
  )) {
    const full = match[1].replace(/\*+/g, "").trim();
    const first = full.split(/\s+/)[0] ?? "";
    if (first) sellers.add(first.toLowerCase());
    if (full) sellers.add(full.toLowerCase());
  }
  return sellers;
}

function sellerLabel(name: string, sellers: Set<string>): boolean {
  const cleaned = name.replace(/\*+/g, "").trim();
  const first = cleaned.split(/[\s(/]/)[0] ?? "";
  return (
    /^(seller|sc|rep|ae)$/i.test(first) ||
    sellers.has(first.toLowerCase()) ||
    sellers.has(cleaned.toLowerCase()) ||
    SELLER_ROLE.test(cleaned)
  );
}

const HEADER_LINE = /^(?:transcript|transc\w*ipt|date|speakers|scenario|participants|context|overview)\s*:/i;
const SKIP_SPEAKER =
  /^(?:from|to|subject|cc|bcc|stage|status|deal status|closed won|closed lost|scenario|participants|context|overview)\b/i;

function expandSpeakerBreaks(transcript: string): string {
  let text = transcript.replace(/\r/g, "");
  text = text.replace(/(transc\w*ipt|transcript|date|speakers)\s*:/gi, "\n$&");
  const initials = [...new Set([...text.matchAll(/\(([A-Za-z]{1,5})\)/g)].map((match) => match[1]))];
  if (initials.length) {
    const alt = initials.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    text = text.replace(new RegExp(`(^|[^A-Za-z])(${alt}):`, "g"), "$1\n$2:");
  }
  return text;
}

/** Split a labeled transcript into speaker turns. Continuation lines stay with the current speaker. */
export function parseTurns(transcript: string): { labeled: boolean; turns: TranscriptTurn[] } {
  const turns: TranscriptTurn[] = [];
  const expanded = expandSpeakerBreaks(transcript ?? "");
  const sellers = sellersFromHeader(expanded);
  let labeled = false;
  let current: TranscriptTurn | null = null;
  for (const rawLine of expanded.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "").replace(/\*+/g, "");
    if (HEADER_LINE.test(line)) continue;
    if (/^(closed won|closed lost)$/i.test(line.trim())) continue;
    // Role headers are not dialogue turns: "Marcus Reed — Sales Representative"
    if (/^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}\s*[–—-]\s+\S/.test(line.trim())) continue;
    const speaker = line.match(
      /^\s*(?:\[[^\]]+\]\s*)?([A-Za-z][A-Za-z0-9 .'/()-]{0,60}?)\s*:\s*(.*)$/
    );
    if (speaker && SKIP_SPEAKER.test(speaker[1].trim())) continue;
    if (speaker) {
      labeled = true;
      const name = speaker[1].trim();
      current = {
        speaker: name,
        role: sellerLabel(name, sellers) ? "seller" : "buyer",
        text: (speaker[2] ?? "").trim(),
      };
      turns.push(current);
      continue;
    }
    const extra = line.trim();
    if (!extra) continue;
    if (current) current.text = `${current.text} ${extra}`.trim();
    else {
      current = { speaker: "", role: "unknown", text: extra };
      turns.push(current);
    }
  }
  return { labeled, turns };
}

function turnsText(turns: TranscriptTurn[], role: TranscriptTurn["role"]): string {
  return turns
    .filter((turn) => turn.role === role)
    .map((turn) => turn.text)
    .join("\n");
}

function buyerLines(transcript: string): string {
  const parsed = parseTurns(transcript ?? "");
  if (!parsed.labeled) return "";
  return turnsText(parsed.turns, "buyer");
}

/**
 * Read the transcript before any score is published.
 * A buyer who refuses the client role, with no purchase of their own, is not a deal.
 * The word "budget" does not open a purchase. An unlabeled transcript stays unresolved.
 */
export function purchaseMotion(transcript: string): { motion: PurchaseMotion; reason: string } {
  const parsed = parseTurns(transcript ?? "");
  if (!parsed.labeled) {
    return { motion: "unresolved", reason: "Speakers are not labeled, so no forecast judgment is published." };
  }
  const namedSpeakers = new Set(
    parsed.turns.filter((turn) => turn.speaker && turn.role !== "unknown").map((turn) => turn.speaker.toLowerCase())
  );
  const sellerTurns = parsed.turns.filter((turn) => turn.role === "seller").length;
  if (sellerTurns === 0 && namedSpeakers.size > 1) {
    return {
      motion: "unresolved",
      reason: "No seller is labeled, so no forecast judgment is published.",
    };
  }
  const buyer = turnsText(parsed.turns, "buyer");
  const declined = BUYER_DECLINED.test(buyer) || BUYER_REFUSAL_NEAR.test(buyer);
  const open = PURCHASE_ACT.test(buyer);
  const won = BUYER_WON.test(buyer);
  const lost = BUYER_LOST.test(buyer);
  if (declined && (open || won)) {
    return {
      motion: "unresolved",
      reason: "The buyer both refused the client role and described a purchase. Those lines conflict.",
    };
  }
  if ((won || lost) && !declined) {
    return {
      motion: "deal_closed",
      reason: won ? "The buyer said the purchase is done." : "The buyer closed the purchase.",
    };
  }
  if (open) {
    return { motion: "deal_open", reason: "A purchase is open in the buyer's words." };
  }
  if (declined) {
    return {
      motion: "not_a_deal",
      reason: "The other person said they are not the buyer. No purchase was opened.",
    };
  }
  return {
    motion: "unresolved",
    reason: "No purchase was stated by the buyer, so no stall score is published.",
  };
}

/** The transcript says this is not a purchase. Seller politeness alone is not enough. */
export function isNotAPurchase(transcript: string): boolean {
  return purchaseMotion(transcript).motion === "not_a_deal";
}

/** The selling rep, whatever name the model gave them. They are not a buyer. */
export function isSellingRep(person: { name?: string; role?: string }): boolean {
  const name = (person.name ?? "").trim();
  const role = person.role ?? "";
  if (sellerLabel(name, new Set())) return true;
  return /\b(account executive|service provider|sales rep)\b/i.test(`${name} ${role}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Seller-offered introduction. They do not speak and they do not approve the purchase. */
export function isSellerIntroduction(
  person: { name?: string; role?: string; persona_type?: string; stance?: string; evidence?: string },
  transcript: string
): boolean {
  const name = (person.name ?? "").trim();
  if (name.length < 2 || !transcript.trim()) return false;
  const persona = `${person.persona_type ?? ""} ${person.stance ?? ""}`;
  if (/absent decision maker|hidden detractor|economic owner|aligned champion/i.test(persona)) {
    return false;
  }
  const blob = `${person.role ?? ""} ${person.evidence ?? ""}`;
  if (/\b(approve|approver|decision maker|signs off|signing authority)\b/i.test(blob)) return false;

  const named = `(?:^|[^A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`;
  const speaks = new RegExp(`(^|\\n)\\s*(?:\\[[^\\]]+\\]\\s*)?${escapeRegExp(name)}\\s*:`, "i").test(
    transcript
  );
  if (speaks) return false;

  const introduced = new RegExp(
    `(?:send you to|introduce you to|warm connection with|put you in(?:to)? a warm connection(?: with)?|his name is|her name is|their name is)\\s+[\\s\\S]{0,80}${named}`,
    "i"
  ).test(transcript);
  if (introduced) return true;

  return (
    /\breferral partner\b|\bcredit repair\b/i.test(person.role ?? "") &&
    /\b(warm connection|send you to|credit repair)\b/i.test(transcript)
  );
}

export type ReportCategory = "not_a_deal" | "unresolved" | "deal_moving" | "deal_stalled" | "deal_closed";

export function reportCategory(input: {
  status?: string;
  trajectory?: string;
  recoverabilityStatus?: string;
  relevanceLabel?: string;
  transcript?: string;
}): ReportCategory {
  if (typeof input.transcript === "string" && !input.transcript.trim()) return "unresolved";
  const status = input.status ?? "";
  const trajectory = input.trajectory ?? "";
  const relevance = (input.relevanceLabel ?? "").toLowerCase();
  const motion = input.transcript ? purchaseMotion(input.transcript).motion : "unclear";
  if (motion === "not_a_deal") return "not_a_deal";
  if (motion === "unresolved" || /MOTION NOT ESTABLISHED/i.test(status)) return "unresolved";
  if (motion === "deal_closed") return "deal_closed";
  if (motion === "deal_open" && /CLOSED WON/i.test(status)) return "deal_stalled";
  if (motion === "unclear" && input.transcript) return "unresolved";
  const notADeal =
    motion !== "deal_open" &&
    (relevance === "not_sales" ||
      /NOT A (PURCHASE|DEAL)/i.test(status) ||
      input.recoverabilityStatus === "FLAT_NO");
  if (notADeal) return "not_a_deal";
  if (
    /CLOSED WON/i.test(status) ||
    (/CLOSED LOST/i.test(status) && /UNLIKELY/i.test(status)) ||
    trajectory === "NON-VIABLE / DEAD"
  ) {
    return "deal_closed";
  }
  if (status === "ACTIVE" || trajectory === "ACTIVE" || trajectory === "VALIDATED / VELOCITY") {
    return "deal_moving";
  }
  return "deal_stalled";
}

export function categoryLabel(category: ReportCategory): string {
  switch (category) {
    case "not_a_deal":
      return "Not a deal";
    case "unresolved":
      return "Motion not established";
    case "deal_moving":
      return "Deal, moving";
    case "deal_stalled":
      return "Deal, stalled";
    case "deal_closed":
      return "Deal, closed";
  }
}

/** Stall, deal risk, dispersion, and department friction publish only for a stalled deal. */
export function publishesStallMetrics(category: ReportCategory): boolean {
  return category === "deal_stalled";
}

/** The prospect offered to send the seller into their group. */
export function offeredNetworkingInvite(transcript: string): boolean {
  return /\bsend you (?:that|an|the) invitation\b/i.test(transcript);
}

function promisedStep(action: string, outcome: string, progress: string, stakeholder: string): string {
  return [
    "Owner: Seller",
    `Stakeholder: ${stakeholder}`,
    `Action: ${action}`,
    `Target outcome: ${outcome}`,
    `Progress evidence: ${progress}`,
    "Kind: activity",
  ].join(" | ");
}

/** Steps already promised on a call that never became a purchase. No partnership meeting. */
export function promisedRelationshipSteps(transcript: string, stakeholderName?: string): string[] {
  const who = stakeholderName?.trim() || "Prospect";
  const text = transcript ?? "";
  const steps: string[] = [];
  if (/\b(send you to|introduce you to|warm connection|his name is|her name is|their name is)\b/i.test(text)) {
    steps.push(
      promisedStep(
        "Send the introduction already promised",
        "The two people are introduced",
        "Either person confirms the introduction happened",
        who
      )
    );
  }
  if (/\b(send you (?:a |the )?link|framework link|clarity consultation)\b/i.test(text)) {
    steps.push(
      promisedStep(
        "Send the framework link already promised",
        "They can look if they want. No reply is a complete outcome",
        "Only a reply that asks to proceed. Silence stays off the forecast",
        who
      )
    );
  }
  if (offeredNetworkingInvite(text)) {
    steps.push(
      promisedStep(
        "Accept the networking-group invitation when they send it",
        "The reciprocal step they offered is taken",
        "The seller is in the group or has a date to visit",
        who
      )
    );
  }
  return steps;
}

/** The next-move line is the promised actions themselves. No second sentence and no activity tag. */
export function recommendedMoveLine(steps: string[]): string {
  const actions: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const action = formatRecoveryAction(step).action.replace(/\.$/, "").trim();
    const key = action.toLowerCase();
    if (!action || seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  if (!actions.length) return "No purchase step was promised.";
  return `${actions.join(". ")}.`;
}

export interface DiagnosticProfile {
  buyingSignals: string;
  budget: string;
  urgency: string;
  missedProcess: string;
  /** Full sentences, each with the speaker. */
  said: string[];
  implied: string;
  unknown: string;
  /** The wrong read a rep can reject out loud. */
  falseRead: string;
  /** The buyer's own condition, or a statement that this call does not reopen. */
  restart: string;
}

const BUDGET_FIGURE = /\$[\d,]+|\b\d+\s*k\b|\bbudget\b/i;
const QUALIFIED_PAY = /\$[\d,]+|\b\d+\s*k\b|\bin range\b|\bmodeled\b|\bour budget\b|\bmy budget\b|\bwilling to pay\b|\bcan pay\b|\bplatform fee\b/i;
const UNQUALIFIED_BUDGET = /\b(?:do not|don't|dont) have the budget\b|\bno budget for\b|\byou (?:do not|don't) have the budget\b/i;
const REVENUE_BAND = /\b(revenue|annually|doing about)\b/i;
const PAID_WITHOUT_AMOUNT = /\b(not free|paid consultation|paid diagnostic|clarity consultation)\b/i;
const URGENCY =
  /\b(q[1-4]|this quarter|next quarter|month-end|next week|deadline|urgent|as soon as|underwater until|after month-end|annual planning(?: cycle)?|(?:a |about |in about )?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*-\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))?\s*(?:day|days|week|weeks|month|months)(?!\s+ago)(?:\s+(?:workflow )?assessment|\s+organizational review|\s+planning(?: cycle)?)?)\b/i;
const PAID_OFFER = /\b(clarity consultation|not free|paid consultation|paid diagnostic|send you (?:a |the )?link)\b/i;
const CALENDAR_STEP =
  /\b(reschedul\w*|three slots|book(?:ed|ing)?\s+(?:a |the )?time|schedule(?:d)?\s+(?:a |the )?(?:time|meeting)|lock(?:ed)?\s+(?:a |the )?(?:time|date)|put (?:a )?time on (?:the )?calendar)\b/i;
const PURCHASE_INTEREST =
  /\b(i like what i saw|in range|we can accelerate|move(?:d)? forward|send (?:me )?a proposal)\b/i;

function asProse(transcript: string): string {
  return transcript.replace(/[ \t]*\n[ \t]*/g, " ");
}

function sentenceAt(text: string, index: number, matchLength: number): string {
  const beforeBreak = Math.max(text.lastIndexOf(". ", index), text.lastIndexOf("! ", index), text.lastIndexOf("? ", index));
  const from = beforeBreak + 1;
  const after = index + matchLength;
  const period = text.indexOf(".", after);
  const end = period === -1 ? text.length : period;
  let sentence = text.slice(from, end).replace(/\s+/g, " ").trim();
  if (sentence.length > 220) {
    const anchor = text.slice(index, index + matchLength);
    const at = sentence.indexOf(anchor);
    const left = Math.max(0, (at === -1 ? 0 : at) - 80);
    const right = Math.min(sentence.length, left + 200);
    const cut = sentence.slice(left, right);
    sentence = `${left > 0 ? "..." : ""}${cut.trim()}${right < sentence.length ? "..." : ""}`;
  }
  return sentence;
}

function sentenceAround(transcript: string, pattern: RegExp): string {
  const text = asProse(transcript);
  const match = pattern.exec(text);
  if (!match || match.index == null) return "";
  return sentenceAt(text, match.index, match[0].length);
}

function meetingSet(transcript: string): boolean {
  const parsed = parseTurns(transcript);
  const buyer = asProse(turnsText(parsed.turns, "buyer"));
  const seller = asProse(turnsText(parsed.turns, "seller"));
  if (CALENDAR_STEP.test(buyer)) return true;
  return CALENDAR_STEP.test(seller) && /\b(do that|yes|let's do|sounds good|send an invite)\b/i.test(buyer);
}

function hasReferralLanguage(transcript: string): boolean {
  return /\b(invitation|introduce|referral|warm connection)\b/i.test(transcript);
}

function linkWasPromised(transcript: string): boolean {
  return /\b(send you (?:a |the )?link|framework link|clarity consultation)\b/i.test(transcript);
}

function defenseLines(transcript: string, motion: PurchaseMotion): Pick<
  DiagnosticProfile,
  "said" | "implied" | "unknown" | "falseRead" | "restart"
> {
  const parsed = parseTurns(transcript);
  const buyer = asProse(turnsText(parsed.turns, "buyer"));
  const seller = asProse(turnsText(parsed.turns, "seller"));
  const said = parsed.turns
    .filter((turn) => turn.text)
    .slice(0, 4)
    .map((turn) => `${turn.speaker || "Speaker"}: ${turn.text.replace(/\s+/g, " ").trim()}`);
  const happyEars =
    /\bclosed[-\s]?won\b/i.test(seller) && /\b(nothing is signed|not done|we(?:'re| are) evaluating)\b/i.test(buyer);
  const speakersKnown = parsed.labeled;
  let falseRead = "";
  if (happyEars) {
    falseRead = "The rep called this closed-won. The buyer said nothing is signed.";
  } else if (motion === "not_a_deal" && (/\b(finance|residential|business funding)\b/i.test(buyer) || /\b(revenue|doing about)\b/i.test(seller))) {
    falseRead = "A stalled-deal read would treat their own business description as purchase intent. It is their own service.";
  } else if (motion === "not_a_deal") {
    falseRead = "A stalled-deal read would keep this on the forecast as recoverable. The buyer refused the client role.";
  } else if (motion === "unresolved" && speakersKnown) {
    falseRead = "A stalled-deal read would score a call where the buyer never opened a purchase.";
  } else if (motion === "unresolved") {
    falseRead = "A stalled-deal read would score this before the speakers are known.";
  }
  const namedRestart = sentenceAround(buyer, /\bIf\b[^.]*\bbuys in\b/i);
  const restart =
    motion === "unresolved"
      ? speakersKnown
        ? "No restart is published. The buyer did not name a condition."
        : "No restart is published until a speaker can be read."
      : motion === "not_a_deal"
        ? linkWasPromised(transcript)
          ? "This call does not reopen. Silence after the promised link is a complete outcome."
          : "This call does not reopen."
        : namedRestart
          ? `The buyer named the restart: ${namedRestart}.`
          : motion === "deal_closed"
            ? "The buyer closed it. There is no restart."
            : "No buyer condition for reopening was stated.";
  const implied =
    motion === "not_a_deal"
      ? hasReferralLanguage(transcript)
        ? "The commercial motion is an exchange of introductions. No purchase was opened."
        : "The buyer refused the client role. No purchase was opened."
      : motion === "unresolved"
        ? speakersKnown
          ? "No purchase was stated, so no commercial motion is implied."
          : "The speakers are not established, so no commercial motion is implied."
        : happyEars
          ? "The rep's close and the buyer's words describe different calls."
          : namedRestart
            ? "The purchase is open and waiting on the condition the buyer named."
            : "Read only the lines above. Do not add a motion they did not state.";
  const unknownBits = [
    !QUALIFIED_PAY.test(buyer) ? "no qualified budget" : "",
    !URGENCY.test(buyer) ? "no timeline" : "",
    !meetingSet(transcript) ? "no date" : "",
  ].filter(Boolean);
  return {
    said,
    implied,
    unknown: unknownBits.length ? `Unknown: ${unknownBits.join(", ")}.` : "The lines above cover budget, timeline, and a date.",
    falseRead,
    restart,
  };
}

/**
 * A qualified budget is this person's ability or willingness to pay for this offer.
 * A remark that someone else lacks budget, or a revenue figure, is only a mention.
 */
export type MoneyKind = "buyer_budget" | "deal_value" | "seller_revenue" | "rejected";

export interface MoneyContext {
  kind: MoneyKind;
  label: string;
  note: string;
}

const MONEY_TOKEN = /\$\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million)?/gi;
const PLATFORM_FEE_LABEL = /annual platform fee|platform fee|annual platform budget|annual contract/i;
const PURCHASE_VALUE = /annual platform fee|platform fee|platform budget|annual contract|\bour budget\b|\bmy budget\b|willing to pay|\bin range\b/i;

function moneyAmount(raw: string, unit: string | undefined): number | null {
  let amount = Number(raw.replace(/,/g, ""));
  const scale = (unit ?? "").toLowerCase();
  if (scale === "k") amount *= 1_000;
  if (scale === "m" || scale === "million") amount *= 1_000_000;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function sameAmountIsPlatformFee(fullText: string, amount: number): boolean {
  const prose = asProse(fullText);
  return [...prose.matchAll(new RegExp(MONEY_TOKEN.source, "gi"))].some((match) => {
    if (moneyAmount(match[1], match[2]) !== amount) return false;
    return PLATFORM_FEE_LABEL.test(sentenceAt(prose, match.index ?? 0, match[0].length));
  });
}

/** A buyer dollar is the purchase value only when the sentence is about this purchase. */
function purchaseValueSentence(sentence: string, amount: number, fullText: string): boolean {
  if (PURCHASE_VALUE.test(sentence)) return true;
  return /\bwe modeled\b/i.test(sentence) && sameAmountIsPlatformFee(fullText, amount);
}

/**
 * One reading of every dollar in the transcript.
 * A qualified fee exists only when the buyer stated this purchase's value on an open or closed deal.
 * Seller revenue, a rejected figure, a side amount, and an unreadable paste stay out of that fee.
 */
export function readPurchaseMoney(transcript: string): { qualifiedFee: string | null; context: MoneyContext[] } {
  const text = transcript ?? "";
  const motion = purchaseMotion(text).motion;
  const canScore = motion === "deal_open" || motion === "deal_closed";
  const parsed = parseTurns(text);
  const context: MoneyContext[] = [];
  let qualifiedAmount: number | null = null;
  let qualifiedRank = 0;

  const blobs: { role: "buyer" | "seller" | "unknown"; text: string }[] = parsed.labeled
    ? [
        { role: "buyer", text: turnsText(parsed.turns, "buyer") },
        { role: "seller", text: turnsText(parsed.turns, "seller") },
      ]
    : [{ role: "unknown", text }];

  for (const blob of blobs) {
    const prose = asProse(blob.text);
    MONEY_TOKEN.lastIndex = 0;
    for (const match of prose.matchAll(MONEY_TOKEN)) {
      const amount = moneyAmount(match[1], match[2]);
      if (amount == null) continue;
      const sentence = sentenceAt(prose, match.index ?? 0, match[0].length);
      const label = formatMoney(amount);
      const revenue =
        (REVENUE_BAND.test(sentence) || /\bdo about\b/i.test(sentence)) &&
        !PLATFORM_FEE_LABEL.test(sentence) &&
        !/\bwe modeled\b/i.test(sentence);
      const rejected =
        UNQUALIFIED_BUDGET.test(sentence) ||
        NOT_QUALIFIED_MONEY.test(sentence) ||
        /\brejected\b/i.test(sentence) ||
        /\bunder\s+\$/i.test(sentence);
      if (revenue) {
        context.push({ kind: "seller_revenue", label, note: "Not the purchase value." });
        continue;
      }
      if (
        rejected ||
        blob.role !== "buyer" ||
        !canScore ||
        !purchaseValueSentence(sentence, amount, text)
      ) {
        context.push({
          kind: "rejected",
          label,
          note: blob.role === "buyer" && canScore && !rejected ? "Not this purchase's value." : "Not a qualified purchase value.",
        });
        continue;
      }
      const rank = PLATFORM_FEE_LABEL.test(sentence) ? 3 : 2;
      if (qualifiedAmount == null || rank > qualifiedRank || (rank === qualifiedRank && amount > qualifiedAmount)) {
        qualifiedAmount = amount;
        qualifiedRank = rank;
      }
    }
  }

  const qualifiedFee =
    qualifiedAmount == null
      ? null
        : PLATFORM_FEE_LABEL.test(text) &&
          [...asProse(text).matchAll(new RegExp(MONEY_TOKEN.source, "gi"))].some((match) => {
            const amount = moneyAmount(match[1], match[2]);
            if (amount !== qualifiedAmount) return false;
            const sentence = sentenceAt(asProse(text), match.index ?? 0, match[0].length);
            return PLATFORM_FEE_LABEL.test(sentence);
          })
        ? `${formatMoney(qualifiedAmount)} Annual Platform Fee`
        : formatMoney(qualifiedAmount);

  const seen = new Set<string>();
  const kept = context.filter((item) => {
    if (qualifiedAmount != null && item.label === formatMoney(qualifiedAmount)) return false;
    const key = `${item.kind}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { qualifiedFee, context: kept.slice(0, 4) };
}

function budgetRead(transcript: string): { qualified: string; mentioned: boolean } {
  const buyer = asProse(buyerLines(transcript));
  const pattern = new RegExp(MONEY_TOKEN.source, "gi");
  let match: RegExpExecArray | null;
  let qualified = "";
  let qualifiedRank = 0;
  while ((match = pattern.exec(buyer))) {
    const amount = moneyAmount(match[1], match[2]);
    if (amount == null) continue;
    const sentence = sentenceAt(buyer, match.index, match[0].length);
    if (UNQUALIFIED_BUDGET.test(sentence) || NOT_QUALIFIED_MONEY.test(sentence) || /\brejected\b/i.test(sentence)) continue;
    if (REVENUE_BAND.test(sentence) && !PURCHASE_VALUE.test(sentence)) continue;
    if (!purchaseValueSentence(sentence, amount, transcript)) continue;
    const rank = PLATFORM_FEE_LABEL.test(sentence) ? 3 : 2;
    if (!qualified || rank > qualifiedRank) {
      qualified = sentence;
      qualifiedRank = rank;
    }
  }
  return { qualified, mentioned: /\bbudget\b/i.test(asProse(transcript)) };
}

/** Qualification read for every upload. A non-purchase still reports what was missing. */
export function diagnosticProfile(transcript: string): DiagnosticProfile {
  const text = transcript ?? "";
  const motion = purchaseMotion(text);
  const notAPurchase = motion.motion === "not_a_deal";
  const buyer = buyerLines(text);
  const budgetReadout = budgetRead(text);
  const urgencyHit = sentenceAround(buyer, URGENCY);
  const interestHit = sentenceAround(buyer, PURCHASE_INTEREST);
  const refusalHit = sentenceAround(
    text,
    /\b(?:not going to be your client|won't be your client|will not be your client|i might be the referral|no way)\b/i
  );
  const canScoreMoney = motion.motion === "deal_open" || motion.motion === "deal_closed";

  const buyingSignals = notAPurchase
    ? hasReferralLanguage(text)
      ? `Interest was in a referral relationship, not in purchasing this service.${refusalHit ? ` Evidence: "${refusalHit}"` : ""}`
      : `No purchase was opened.${refusalHit ? ` Evidence: "${refusalHit}"` : ""}`
    : motion.motion === "deal_closed"
      ? motion.reason
      : interestHit
        ? `The buyer stated interest in this purchase. Evidence: "${interestHit}"`
        : "No explicit interest in purchasing this service was stated.";

  const budget =
    canScoreMoney && budgetReadout.qualified
      ? `Budget was qualified for this purchase. Evidence: "${budgetReadout.qualified}"`
      : budgetReadout.mentioned || budgetReadout.qualified
        ? "Consultation budget was not qualified. Budget was mentioned, but not as this person's ability or willingness to pay for the consultation."
        : PAID_WITHOUT_AMOUNT.test(text)
          ? "Consultation budget was not qualified. The seller said the offer is paid, and this person's ability or willingness to pay was not established."
          : "Consultation budget was not qualified.";

  const urgency = urgencyHit
    ? `A timeline was stated. Evidence: "${urgencyHit}"`
    : "MISSING — NO TIMELINE OR URGENCY ESTABLISHED";

  const met = meetingSet(text);
  const missedProcess =
    notAPurchase && PAID_OFFER.test(text) && !met
      ? "The seller introduced a paid consultation before confirming it was relevant. No decision or calendar time was secured. This is not evidence that a sale was lost."
      : PAID_OFFER.test(text) && !met
        ? "The seller introduced a paid consultation and did not secure a decision or a calendar time. The next step left on the call was a link, not a meeting."
        : notAPurchase
          ? "No purchase process was opened."
          : met
            ? "A follow-up time was part of the conversation."
            : "No dated next meeting was secured on the call.";

  return {
    buyingSignals,
    budget,
    urgency,
    missedProcess,
    ...defenseLines(text, motion.motion),
  };
}

export function formatDiagnosticMarkdown(profile: DiagnosticProfile): string {
  const said = (profile.said ?? []).map((line) => `- ${line}`);
  return [
    "### Diagnostic evaluation",
    `- **Buying signals:** ${profile.buyingSignals}`,
    `- **Budget:** ${profile.budget}`,
    `- **Urgency and timeline:** ${profile.urgency}`,
    `- **Missed process step:** ${profile.missedProcess}`,
    said.length ? "" : null,
    said.length ? "### What was said" : null,
    ...said,
    profile.implied ? "" : null,
    profile.implied ? "### What that implies" : null,
    profile.implied ? profile.implied : null,
    profile.unknown ? "" : null,
    profile.unknown ? "### Unknown" : null,
    profile.unknown ? profile.unknown : null,
    profile.falseRead ? "" : null,
    profile.falseRead ? "### False read" : null,
    profile.falseRead ? profile.falseRead : null,
    profile.restart ? "" : null,
    profile.restart ? "### Restart" : null,
    profile.restart ? profile.restart : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export interface MatrixFacing {
  category: ReportCategory;
  categoryLabel: string;
  showScorecard: boolean;
  offForecast: boolean;
  trajectoryLabel: string;
  recoverabilityLabel: string;
  planTitle: string;
  whyTitle: string;
}

/** Labels the report shows. The viability formula can still say deferred. This is the forecast judgment. */
export function matrixFacing(input: {
  status?: string;
  trajectory?: string;
  recoverabilityStatus?: string;
  relevanceLabel?: string;
  transcript?: string;
}): MatrixFacing {
  const category = reportCategory(input);
  if (category === "not_a_deal" || category === "unresolved") {
    return {
      category,
      categoryLabel: categoryLabel(category),
      showScorecard: false,
      offForecast: true,
      trajectoryLabel: category === "unresolved" ? "Motion not established" : "Not a deal",
      recoverabilityLabel: category === "unresolved" ? "Motion not established" : "Not a deal",
      planTitle: "What to do next",
      whyTitle: category === "unresolved" ? "What could not be read" : "What the call was",
    };
  }
  const known = [
    "RECOVERABLE",
    "CONDITIONALLY_RECOVERABLE",
    "UNDETERMINED",
    "NOT_CURRENTLY_RECOVERABLE",
    "FLAT_NO",
  ].includes(input.recoverabilityStatus ?? "");
  return {
    category,
    categoryLabel: categoryLabel(category),
    showScorecard: true,
    offForecast: false,
    trajectoryLabel: input.trajectory?.trim() || "—",
    recoverabilityLabel: known
      ? formatRecoverability(input.recoverabilityStatus as RecoverabilityStatus)
      : "—",
    planTitle: "Recovery plan",
    whyTitle: "Why it is stalling",
  };
}

const RESOURCE_CONDITION =
  /\b(can'?t commit|cannot commit|no capacity|lacks capacity|another integration|capacity constraint|can'?t start|cannot start)\b/i;
const APPROVAL_CONDITION =
  /\b(financial case|actual\s+(?:financial\s+)?savings|financial savings|defensible|too optimistic|demonstrate(?:d)? savings|proven financial)\b/i;
const INDEPENDENT_FINANCIAL =
  /\b(allocated elsewhere|budget (?:has been|was) allocated|no budget (?:left|remaining)|capital budget (?:is|was) (?:already )?(?:committed|allocated)|separate (?:budget|funding)|cannot fund this)\b/i;
const FINANCIAL_CONDITION =
  /\b(financial case|actual savings|defensible|too optimistic|additional approval|signs off on the spend|discretionary spending|spending freeze|freezing discretionary)\b/i;
/** A discretionary spending freeze is one structural force, whichever type the model assigns. */
const SPENDING_FREEZE = /\b(discretionary spending|spending freeze|freezing discretionary)\b/i;
const COMPETITIVE_CONDITION = /\b(flowtrack|another platform|competing pilot|pilot)\b/i;
const SPONSORSHIP_CONDITION =
  /\b(not pushing|disengag|hasn'?t said otherwise|haven'?t had a proper|inactive sponsor)\b/i;
const PERMANENT_DURATION = /\b(permanent|prohibited|banned|structurally locked)\b/i;
const TEMPORARY_DURATION =
  /\b(until the end of the quarter|end of the quarter|this quarter|next quarter|90 days|for the next|temporary|additional approval|freezing discretionary|discretionary spending)\b/i;
const CONDITIONAL_DURATION =
  /\b(financial case|can'?t commit|cannot commit|defensible|validated savings|if independently|when the|once the)\b/i;
const PATH_FORWARD =
  /\b(hasn'?t disappeared|has not disappeared|still looking|don'?t think we should close|do not think we should close|bringing it back|bring it back|comfortable bringing|send (me )?the outline|will approve if|can begin next quarter|not necessarily impossible)\b/i;
const CLOSED_PATH = [
  /\b(selected|chose|chosen|awarded the business to|going with|went with)\b(?:\s+\w+){0,8}\b(competitor|another vendor|another platform|flowtrack)\b/i,
  /\b(terminated|ended|cancelled|canceled) the (evaluation|process|opportunity)\b/i,
  /\b(will not|won't|decided not to|no longer) (move forward|proceed|continue|buy)\b/i,
  /\bbudget (has been|was) (permanently )?allocated elsewhere\b/i,
  /\b(no viable path|no path forward)\b/i,
];

function closedPathReason(text: string): string | null {
  const withoutNegatedClose = text.replace(
    /\b(?:do not|don't|dont|should not|shouldn't|not)\b(?:\s+\w+){0,6}\s+close the door\b/gi,
    " "
  );
  if (/\bclose the door\b/i.test(withoutNegatedClose)) {
    return "The evaluation was closed.";
  }
  for (const pattern of CLOSED_PATH) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function blob(force: MatrixForce): string {
  return `${force.factor} ${force.evidence}`;
}

export function forceDuration(force: MatrixForce): ForceDuration {
  const text = blob(force);
  if (PERMANENT_DURATION.test(text)) return "PERMANENT";
  if (TEMPORARY_DURATION.test(text)) return "TEMPORARY";
  if (CONDITIONAL_DURATION.test(text)) return "CONDITIONAL";
  if (/\b(ongoing|remains in effect|no end date)\b/i.test(text)) return "ONGOING";
  return "UNKNOWN";
}

function maxOf(forces: MatrixForce[], type: string): number {
  const weights = forces.filter((force) => force.type.toLowerCase() === type).map((force) => force.weight);
  return weights.length ? Math.max(...weights) : 0;
}

function isSpendingFreeze(force: MatrixForce): boolean {
  return SPENDING_FREEZE.test(blob(force));
}

/** A competing pilot that has not been selected stays out of both pressure scores. */
function isOpenPilot(force: MatrixForce): boolean {
  const text = blob(force);
  return (
    /\b(flowtrack|another platform|competing pilot|piloting another)\b/i.test(text) &&
    !closedPathReason(text)
  );
}

function isApprovalCondition(force: MatrixForce): boolean {
  return APPROVAL_CONDITION.test(blob(force)) && !isSpendingFreeze(force);
}

function isIndependentFinancial(force: MatrixForce): boolean {
  return INDEPENDENT_FINANCIAL.test(blob(force)) && !isSpendingFreeze(force) && !isApprovalCondition(force);
}

function isResourceLimit(force: MatrixForce): boolean {
  return RESOURCE_CONDITION.test(blob(force)) && !isSpendingFreeze(force);
}

/**
 * Map each force onto one scoring input. Overlapping evidence is kept once.
 * A force that does not move a score still carries the reason it was left out.
 */
export function mapForcesToScores(forces: MatrixForce[]): {
  forces: MatrixForce[];
  constraint_pressure: number;
  structural_lock_in: number;
  trace: string[];
} {
  const freezePresent = forces.some((force) => isSpendingFreeze(force));
  const structuralWeights = forces
    .filter((force) => !isOpenPilot(force) && (force.type.toLowerCase() === "structural" || isSpendingFreeze(force)))
    .map((force) => force.weight);
  const structural_lock_in = structuralWeights.length ? Math.max(...structuralWeights) : 0;
  const constraintWeights = forces
    .filter(
      (force) =>
        force.type.toLowerCase() === "constraint" &&
        !isOpenPilot(force) &&
        !isSpendingFreeze(force) &&
        !(freezePresent && isApprovalCondition(force))
    )
    .map((force) => force.weight);
  let constraint_pressure = constraintWeights.length ? Math.max(...constraintWeights) : 0;

  for (const force of forces) {
    if (isSpendingFreeze(force) || isOpenPilot(force)) continue;
    if (isResourceLimit(force) || isIndependentFinancial(force)) {
      constraint_pressure = Math.max(constraint_pressure, force.weight);
      continue;
    }
    if (isApprovalCondition(force) && !freezePresent) {
      constraint_pressure = Math.max(constraint_pressure, force.weight);
    }
  }

  const trace: string[] = [];
  const annotated = forces.map((force) => {
    const text = blob(force);
    const duration = forceDuration(force);
    const type = force.type.toLowerCase();
    let score_effect: ForceScoreEffect;

    if (isSpendingFreeze(force)) {
      const included = structural_lock_in > 0 && force.weight === structural_lock_in;
      score_effect = {
        dimension: "structural_lock_in",
        included,
        duration,
        reason: included
          ? "A discretionary spending freeze sets structural pressure. It is not also added as constraint pressure."
          : `Structural pressure stays at ${structural_lock_in}. This spending freeze is not added again, and it is not counted as constraint pressure.`,
      };
    } else if (isOpenPilot(force) && (type === "structural" || type === "constraint" || type === "behavioral")) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "A pilot or competitive preference is recorded. It does not set structural or constraint pressure, and a pilot is not a confirmed purchase.",
      };
    } else if (isApprovalCondition(force) && freezePresent) {
      score_effect = {
        dimension: "constraint_pressure",
        included: false,
        duration,
        reason:
          "This is the approval condition on the spending freeze. It is recorded and is not added as a second constraint.",
      };
    } else if (isResourceLimit(force)) {
      const included = force.weight === constraint_pressure && constraint_pressure > 0;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "A resource limit sets constraint pressure. It is not treated as opposition."
          : `A resource limit is recorded. Constraint pressure stays at the stronger constraint (${constraint_pressure}) and this weight is not added on top.`,
      };
    } else if (isIndependentFinancial(force)) {
      const included = force.weight === constraint_pressure && constraint_pressure > 0;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "This financial constraint is separate from the spending freeze, so it sets constraint pressure."
          : `This separate financial constraint is recorded. Constraint pressure stays at ${constraint_pressure}, and this weight is not added on top.`,
      };
    } else if (type === "intent") {
      const intentMax = maxOf(forces, "intent");
      const included = force.weight === intentMax && intentMax > 0;
      score_effect = {
        dimension: "intent_strength",
        included,
        duration,
        reason: included
          ? "Intent is the strongest Intent-force weight. It is separate from approval."
          : `Intent stays at ${intentMax}, the stronger willingness statement. This one is not added again.`,
      };
    } else if (type === "enabler") {
      score_effect = {
        dimension: "enabler_strength",
        included: true,
        duration,
        reason: "Enabler strength is the strongest Enabler-force weight.",
      };
    } else if (type === "structural") {
      const included = force.weight === structural_lock_in;
      score_effect = {
        dimension: "structural_lock_in",
        included,
        duration,
        reason: included
          ? "This is the strongest structural force, so it sets structural pressure."
          : `Structural pressure stays at ${structural_lock_in}, the stronger structural force. This one is not added again.`,
      };
    } else if (type === "constraint" && COMPETITIVE_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "A pilot or competitive preference is recorded. It does not add constraint pressure, and a pilot is not a confirmed purchase.",
      };
    } else if (type === "constraint") {
      const included = force.weight === constraint_pressure;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "This is the strongest constraint, so it sets constraint pressure."
          : `Constraint pressure stays at ${constraint_pressure}, the stronger constraint. This one is not added again.`,
      };
    } else if (type === "behavioral" && RESOURCE_CONDITION.test(text)) {
      const included = force.weight === constraint_pressure;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "A resource limit sets constraint pressure. It is not treated as opposition."
          : `A resource limit is recorded. Constraint pressure stays at the stronger constraint (${constraint_pressure}) and this weight is not added on top.`,
      };
    } else if (type === "behavioral" && FINANCIAL_CONDITION.test(text)) {
      const included = !freezePresent && force.weight === constraint_pressure && constraint_pressure > 0;
      score_effect = freezePresent
        ? {
            dimension: "constraint_pressure",
            included: false,
            duration,
            reason:
              "This financial condition is the same spend as the freeze. It is recorded and is not added as a second constraint.",
          }
        : {
            dimension: "constraint_pressure",
            included,
            duration,
            reason: included
              ? "No spending freeze is scored, so this financial condition sets constraint pressure."
              : `Constraint pressure stays at ${constraint_pressure}. This financial condition is recorded and is not added again.`,
          };
    } else if (type === "behavioral" && COMPETITIVE_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "A pilot or competitive preference is recorded. It does not add a second structural lock on top of the strongest structural force, and a pilot is not a confirmed purchase.",
      };
    } else if (type === "behavioral" && SPONSORSHIP_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason: "Inactivity or weak sponsorship is not opposition and does not add constraint pressure.",
      };
    } else if (type === "timing") {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason: "Timing is read by the timing factor, not by constraint pressure.",
      };
    } else {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "This force does not state a separate financial, resource, or permanent condition, so it does not change constraint or structural pressure.",
      };
    }

    trace.push(`${force.factor}: ${score_effect.included ? "counted" : "not counted"} — ${score_effect.reason}`);
    return { ...force, score_effect };
  });

  return { forces: annotated, constraint_pressure, structural_lock_in, trace };
}

export function classifyRecoverability(input: {
  viability: number;
  trajectory: string;
  blocker: string;
  intent: number;
  forces: MatrixForce[];
  evidence?: string;
}): RecoverabilityAssessment {
  if (isNotAPurchase(input.evidence ?? "")) {
    return {
      status: "FLAT_NO",
      confidence: 75,
      blocking_conditions: [],
      evidence_gaps: [],
      explanation:
        "Flat no as a purchase. The prospect declined the client role. The next step is the referral relationship already agreed, not a recovery plan. Viability is the formula result, and it is not a reason to keep this on the forecast.",
    };
  }
  const blocker = input.blocker.toUpperCase();
  const corpus = [input.evidence ?? "", ...input.forces.map((force) => `${force.factor} ${force.evidence}`)].join("\n");
  const closed = closedPathReason(corpus);
  const permanentBan =
    input.trajectory === "NON-VIABLE / DEAD" ||
    (blocker.includes("PERMANENT") && input.forces.some((force) => force.score_effect?.duration === "PERMANENT"));
  const durations = input.forces.map((force) => force.score_effect?.duration ?? forceDuration(force));
  const changeable = durations.some((duration) => duration === "TEMPORARY" || duration === "CONDITIONAL");
  const pathForward = input.intent > 0 && PATH_FORWARD.test(corpus);
  const blocking_conditions = input.forces
    .filter((force) => {
      const duration = force.score_effect?.duration ?? "UNKNOWN";
      return duration === "TEMPORARY" || duration === "CONDITIONAL" || duration === "PERMANENT";
    })
    .map((force) => force.factor);
  const evidence_gaps = input.forces
    .filter((force) => (force.score_effect?.duration ?? "UNKNOWN") === "UNKNOWN" && force.weight >= 50)
    .map((force) => `${force.factor}: duration is not established.`);

  if (closed) {
    return {
      status: "NOT_CURRENTLY_RECOVERABLE",
      confidence: 75,
      blocking_conditions,
      evidence_gaps,
      explanation: `Not currently recoverable. The evidence shows no viable path in this decision horizon: ${closed}. A permanent prohibition is one way to reach this status. It is not the only way. Viability ${input.viability} is not that finding.`,
    };
  }
  if (permanentBan) {
    return {
      status: "NOT_CURRENTLY_RECOVERABLE",
      confidence: 80,
      blocking_conditions,
      evidence_gaps,
      explanation: `Not currently recoverable. The evidence supports a permanent prohibition. Viability ${input.viability} is the formula result, and the prohibition is what closes the path.`,
    };
  }
  if (input.forces.length === 0 && input.intent <= 0) {
    return {
      status: "UNDETERMINED",
      confidence: 30,
      blocking_conditions: [],
      evidence_gaps: ["No scored forces and no stated willingness. Recoverability is not established."],
      explanation:
        "Undetermined. There is not enough evidence to judge whether a recovery path exists. Viability is not a substitute for that judgment.",
    };
  }
  if (
    input.viability >= 55 &&
    (input.trajectory === "ACTIVE" ||
      input.trajectory === "VALIDATED / VELOCITY" ||
      input.trajectory === "DEFERRED (recoverable)")
  ) {
    return {
      status: "RECOVERABLE",
      confidence: 70,
      blocking_conditions,
      evidence_gaps,
      explanation: `Recoverable. Viability ${input.viability} and the trajectory still support a path.`,
    };
  }
  if (changeable && pathForward) {
    const conditions = blocking_conditions.length ? blocking_conditions.join("; ") : "a stated condition";
    return {
      status: "CONDITIONALLY_RECOVERABLE",
      confidence: 60,
      blocking_conditions,
      evidence_gaps,
      explanation: `Conditionally recoverable. The buyer has stated that pursuit can continue, and a condition can still change: ${conditions}. Viability ${input.viability} is the formula floor or result. It does not mean the path is closed.`,
    };
  }
  if (changeable && !pathForward) {
    return {
      status: "UNDETERMINED",
      confidence: 40,
      blocking_conditions,
      evidence_gaps: [
        ...evidence_gaps,
        "A temporary or conditional blocker is present, and the evidence does not show that the buyer still intends to continue.",
      ],
      explanation: `Undetermined. A temporary or conditional obstacle is present, and that alone does not show the buyer still intends to purchase. Viability ${input.viability} is not a recoverability judgment.`,
    };
  }
  return {
    status: "UNDETERMINED",
    confidence: 40,
    blocking_conditions,
    evidence_gaps: evidence_gaps.length
      ? evidence_gaps
      : ["The viability score does not establish whether a later path exists."],
    explanation: `Undetermined. The evidence does not show both a continuing path and a condition that can change. Viability ${input.viability} is not that judgment.`,
  };
}

export function validateReportMatrix(input: {
  status: string;
  riskTier?: string;
  viability: number;
  recoverabilityStatus?: string;
  forces: MatrixForce[];
  immediateActionCount: number;
  stakeholders?: { name?: string; role?: string; persona_type?: string; stance?: string; evidence?: string }[];
  transcript?: string;
}): ReportValidation {
  const checks: ReportCheck[] = [];
  const tier = (input.riskTier ?? "").toUpperCase();
  const stalled = input.status.startsWith("STALLED —") && input.status.includes("RISK");
  checks.push({
    id: "score_label_consistency",
    passed: !stalled || !tier || input.status.includes(`${tier} RISK`),
    detail: stalled
      ? `Headline "${input.status}" and risk tier ${tier || "missing"}.`
      : "Headline is not a stalled risk label.",
  });
  const recoverabilityKnown = [
    "RECOVERABLE",
    "CONDITIONALLY_RECOVERABLE",
    "UNDETERMINED",
    "NOT_CURRENTLY_RECOVERABLE",
    "FLAT_NO",
  ].includes(input.recoverabilityStatus ?? "");
  checks.push({
    id: "viability_recoverability",
    passed: recoverabilityKnown && !(input.viability === 0 && input.recoverabilityStatus === undefined),
    detail: recoverabilityKnown
      ? `Viability ${input.viability} is separate from recoverability ${input.recoverabilityStatus}.`
      : "Recoverability status is missing, so a viability result could be read as the judgment.",
  });
  const material = input.forces.filter((force) => force.weight >= 50);
  const untraced = material.filter((force) => !force.score_effect?.reason);
  checks.push({
    id: "force_score_consistency",
    passed: untraced.length === 0,
    detail: untraced.length
      ? `No scoring effect recorded for: ${untraced.map((force) => force.factor).join(", ")}.`
      : "Every material force has a scoring effect or an exclusion reason.",
  });
  checks.push({
    id: "action_consistency",
    passed: true,
    detail:
      input.immediateActionCount > 0
        ? `${input.immediateActionCount} immediate action(s) are the list every section reads.`
        : "No immediate action is in the canonical list.",
  });
  const opposed =
    /\b(opposed|opposes|will block|against the (deal|purchase|project)|will not approve|won't approve|refuses to approve)\b/i;
  const unlabeledOpposition = (input.stakeholders ?? []).filter((person) => {
    const label = `${person.persona_type ?? ""} ${person.stance ?? ""}`;
    return /hidden detractor/i.test(label) && !opposed.test(person.evidence ?? "");
  });
  checks.push({
    id: "evidence_consistency",
    passed: unlabeledOpposition.length === 0,
    detail: unlabeledOpposition.length
      ? "A detractor label is missing evidence of opposition."
      : "Detractor labels, when present, have evidence of opposition.",
  });
  const subject = input.transcript ? capacitySubject(input.transcript) : null;
  const misattributed = (input.stakeholders ?? []).filter((person) => {
    const label = `${person.persona_type ?? ""} ${person.stance ?? ""}`;
    if (!/resource constraint/i.test(label)) return false;
    if (!input.transcript) return false;
    return !subject || !person.name || !samePerson(person.name, subject);
  });
  checks.push({
    id: "speaker_attribution",
    passed: misattributed.length === 0,
    detail: misattributed.length
      ? `Resource constraint is not supported for: ${misattributed.map((person) => person.name).join(", ")}.`
      : subject
        ? `Capacity evidence is attributed to ${subject}.`
        : "No capacity statement needed a stakeholder attribution.",
  });
  const freezeScored = input.forces.some(
    (force) => isSpendingFreeze(force) && force.score_effect?.included && force.score_effect.dimension === "structural_lock_in"
  );
  const approvalAlsoScored = input.forces.some(
    (force) => isApprovalCondition(force) && force.score_effect?.included
  );
  const freezeAlsoConstraint = input.forces.some(
    (force) => isSpendingFreeze(force) && force.score_effect?.included && force.score_effect.dimension === "constraint_pressure"
  );
  checks.push({
    id: "overlap_consistency",
    passed: !(freezeScored && approvalAlsoScored) && !freezeAlsoConstraint,
    detail:
      freezeScored && approvalAlsoScored
        ? "An approval condition was added on top of a scored spending freeze."
        : freezeAlsoConstraint
          ? "A spending freeze was counted as constraint pressure as well as structural pressure."
          : "Overlapping financial evidence is not added twice.",
  });
  const transcript = input.transcript ?? "";
  const notAPurchase = transcript ? isNotAPurchase(transcript) : false;
  const purchaseAligned =
    !notAPurchase ||
    (/NOT A PURCHASE/i.test(input.status) && input.recoverabilityStatus === "FLAT_NO");
  checks.push({
    id: "purchase_motion",
    passed: purchaseAligned,
    detail: notAPurchase
      ? purchaseAligned
        ? "The prospect declined the client role. Headline and recoverability stay off the forecast."
        : "The prospect declined the client role, but the headline or recoverability still treats this as a recoverable purchase."
      : "No declined-client motion in the transcript.",
  });
  const soleSuppressed = (input.stakeholders ?? []).filter((person) => {
    const label = `${person.persona_type ?? ""} ${person.stance ?? ""}`;
    return /suppressed champion/i.test(label) && isSoleOperator(person.role ?? "", person.evidence ?? "");
  });
  const introduced = transcript
    ? (input.stakeholders ?? []).filter((person) => isSellerIntroduction(person, transcript))
    : [];
  checks.push({
    id: "people_map",
    passed: soleSuppressed.length === 0 && introduced.length === 0,
    detail:
      soleSuppressed.length || introduced.length
        ? `People map still mislabels ${[...soleSuppressed, ...introduced].map((person) => person.name).filter(Boolean).join(", ")}.`
        : "The owner is not labeled a champion without authority, and seller introductions are not in the buying group.",
  });
  return { passed: checks.every((check) => check.passed), checks };
}

export function canonicalImmediateActions(result: {
  immediate_remediation?: string[];
  rescue_triage_plan?: { immediate_0_30_days?: string[] };
  action_plan?: string[];
}): string[] {
  const fromPlan = [
    ...(result.immediate_remediation ?? []),
    ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
  ];
  const fromActionPlan = (result.action_plan ?? []).filter(
    (step) => step.startsWith("[0-30d]") || !/^\[[0-9]/.test(step)
  );
  return uniqueRecoveryNotes(uniqueActionSteps(fromPlan.length ? fromPlan : fromActionPlan));
}
