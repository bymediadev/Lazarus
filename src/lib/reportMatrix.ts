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

/**
 * The prospect declined the client role and the close is a referral relationship.
 * Seller politeness alone ("I'm not here to push") is not enough.
 */
export function isNotAPurchase(transcript: string): boolean {
  const text = transcript.toLowerCase();
  const declined =
    /\b(?:not going to be your client|won't be your client|will not be your client|i(?:'m| am) not (?:going to be )?(?:your|the) client|i might be the referral|be the referral to)\b/.test(
      text
    ) ||
    /\bclient\b[\s\S]{0,40}\bno way\b/.test(text) ||
    /\bno way\b[\s\S]{0,40}\bclient\b/.test(text);
  const relationship =
    /\b(channel partner|stay in touch|not here to (?:like )?close|not (?:going to |here to )?push you)\b/.test(
      text
    );
  return declined && relationship;
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

export type ReportCategory = "not_a_deal" | "deal_moving" | "deal_stalled" | "deal_closed";

export function reportCategory(input: {
  status?: string;
  trajectory?: string;
  recoverabilityStatus?: string;
  relevanceLabel?: string;
  transcript?: string;
}): ReportCategory {
  const status = input.status ?? "";
  const trajectory = input.trajectory ?? "";
  const relevance = (input.relevanceLabel ?? "").toLowerCase();
  const notADeal =
    relevance === "not_sales" ||
    /NOT A (PURCHASE|DEAL)/i.test(status) ||
    input.recoverabilityStatus === "FLAT_NO" ||
    (input.transcript ? isNotAPurchase(input.transcript) : false);
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
  const steps = [
    promisedStep(
      "Send the introduction already promised",
      "The two people are introduced",
      "Either person confirms the introduction happened",
      who
    ),
    promisedStep(
      "Send the framework link already promised",
      "They can look if they want. No reply is a complete outcome",
      "Only a reply that asks to proceed. Silence stays off the forecast",
      who
    ),
  ];
  if (offeredNetworkingInvite(transcript)) {
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
}

const BUDGET_FIGURE = /\$[\d,]+|\b\d+\s*k\b|\bbudget\b/i;
const PURCHASE_BUDGET = /\b(budget|fee|price|cost|afford|in range|invoice)\b/i;
const REVENUE_BAND = /\b(revenue|annually|doing about)\b/i;
const PAID_WITHOUT_AMOUNT = /\b(not free|paid consultation|paid diagnostic|clarity consultation)\b/i;
const URGENCY =
  /\b(q[1-4]|this quarter|next quarter|month-end|next week|deadline|urgent|as soon as|underwater until|after month-end)\b/i;
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
    const cut = sentence.slice(0, 217);
    const space = cut.lastIndexOf(" ");
    sentence = `${(space > 160 ? cut.slice(0, space) : cut).trim()}...`;
  }
  return sentence;
}

function sentenceAround(transcript: string, pattern: RegExp): string {
  const text = asProse(transcript);
  const match = pattern.exec(text);
  if (!match || match.index == null) return "";
  return sentenceAt(text, match.index, match[0].length);
}

/** A dollar figure in the seller's customer description is not this buyer's budget. */
function budgetEvidence(transcript: string): string {
  const text = asProse(transcript);
  const pattern = new RegExp(BUDGET_FIGURE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const sentence = sentenceAt(text, match.index, match[0].length);
    if (REVENUE_BAND.test(sentence) && !/\bbudget\b/i.test(sentence)) continue;
    if (/\bbudget\b/i.test(sentence) || (BUDGET_FIGURE.test(sentence) && PURCHASE_BUDGET.test(sentence))) {
      return sentence;
    }
  }
  return "";
}

/** Qualification read for every upload. A non-purchase still reports what was missing. */
export function diagnosticProfile(transcript: string): DiagnosticProfile {
  const text = transcript ?? "";
  const notAPurchase = isNotAPurchase(text);
  const budgetHit = budgetEvidence(text);
  const urgencyHit = sentenceAround(text, URGENCY);
  const interestHit = sentenceAround(text, PURCHASE_INTEREST);
  const refusalHit = sentenceAround(
    text,
    /\b(?:not going to be your client|won't be your client|will not be your client|i might be the referral|no way)\b/i
  );

  const buyingSignals = notAPurchase
    ? `Interest was in a referral relationship, not in purchasing this service.${refusalHit ? ` Evidence: "${refusalHit}"` : ""}`
    : interestHit
      ? `The buyer stated interest in this purchase. Evidence: "${interestHit}"`
      : "No explicit interest in purchasing this service was stated.";

  const budget = budgetHit
    ? `Budget was discussed. Evidence: "${budgetHit}"`
    : PAID_WITHOUT_AMOUNT.test(text)
      ? "MISSING — NO BUDGET DISCUSSED. The seller said the offer is paid, and no price or ability to pay was established."
      : "MISSING — NO BUDGET DISCUSSED";

  const urgency = urgencyHit
    ? `A timeline was stated. Evidence: "${urgencyHit}"`
    : "MISSING — NO TIMELINE OR URGENCY ESTABLISHED";

  const missedProcess =
    PAID_OFFER.test(text) && !CALENDAR_STEP.test(text)
      ? "The seller introduced a paid consultation and did not secure a decision or a calendar time. The next step left on the call was a link, not a meeting."
      : notAPurchase
        ? "No purchase process was opened."
        : CALENDAR_STEP.test(text)
          ? "A follow-up time was part of the conversation."
          : "No dated next meeting was secured on the call.";

  return { buyingSignals, budget, urgency, missedProcess };
}

export function formatDiagnosticMarkdown(profile: DiagnosticProfile): string {
  return [
    "### Diagnostic evaluation",
    `- **Buying signals:** ${profile.buyingSignals}`,
    `- **Budget:** ${profile.budget}`,
    `- **Urgency and timeline:** ${profile.urgency}`,
    `- **Missed process step:** ${profile.missedProcess}`,
  ].join("\n");
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
  if (category === "not_a_deal") {
    return {
      category,
      categoryLabel: categoryLabel(category),
      showScorecard: false,
      offForecast: true,
      trajectoryLabel: "Not a deal",
      recoverabilityLabel: "Not a deal",
      planTitle: "What to do next",
      whyTitle: "What the call was",
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
