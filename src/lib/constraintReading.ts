export type ConstraintKind =
  | "technical_approval"
  | "budget_resistance"
  | "financial_approval"
  | "procurement_or_legal"
  | "confirmed_rejection"
  | "active_opposition"
  | "delayed_meeting"
  | "absent_stakeholder"
  | "insufficient_evidence"
  | "conflicting_statements"
  | "multiple_blockers"
  | "unspecified";

export interface ConstraintReading {
  kind: ConstraintKind;
  label: string;
  observed: string[];
  interpretation: string;
  missing: string[];
  blockers: string[];
}

const REJECTION =
  /\b(decided not to|will not move forward|won't move forward|proposal is rejected|we rejected|going with another|chose another|this is a no|will not buy|do not buy)\b/i;
const BUDGET_NEG = /\b(no budget|not in the budget|too expensive|cannot afford|can't afford|over budget|will not pay|won't pay)\b/i;
const BUDGET_OK =
  /\b(in range|what we modeled|budget modeled|already budgeted|budget approved|approved the budget|not the primary obstacle|not a budget)\b/i;
const DELAY =
  /\b(missed the|couldn'?t join|could not join|reschedule|p1 outage|underwater until|meeting was delayed)\b/i;
const ABSENT = /\b(not on the call|not on this call|wasn'?t on the call|absent)\b/i;
const TECHNICAL =
  /\b(hasn'?t validated|has not validated|hasn'?t signed off|has not signed off|ot network|production vlan|technical approval|nothing(?:'s| is) approved)\b/i;
const OPPOSITION = /\b(opposed|will block|refuses to approve|against the (deal|purchase))\b/i;
const FINANCIAL_APPROVAL =
  /\b(spending freeze|freezing discretionary|discretionary spending|additional approval|financial case|actual savings|assumptions are too optimistic)\b/i;
const OPEN_REQUIREMENT =
  /\b(until|must|has to|have to|needs to|need to|waiting|frozen|freeze|will not|won't|blocked|redline|outstanding)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function confirmedTechnical(text: string): boolean {
  if (TECHNICAL.test(text)) return true;
  return sentences(text).some((sentence) => {
    if (!/\bsigns off\b/i.test(sentence)) return false;
    const commercial = /\b(spend|budget|financial|purchase)\b/i.test(sentence);
    const technicalNoun = /\b(architecture|network|technical)\b/i.test(sentence);
    return technicalNoun && !commercial;
  });
}

/** A department word and an open requirement have to describe the same sentence. */
function procurementBlock(text: string): boolean {
  return sentences(text).some((sentence) => {
    if (!/\b(legal|procurement|security|compliance)\b/i.test(sentence)) return false;
    const anticipatedReview =
      /\b(security reviews?|integration and security)\b/i.test(sentence) &&
      !/\b(blocked|will not|won't|outstanding|failed|rejected|redline)\b/i.test(sentence);
    if (anticipatedReview) return false;
    const completed = /\b(signed|approved|issued|cleared)\b/i.test(sentence);
    const openRequirement = OPEN_REQUIREMENT.test(sentence);
    if (completed && !openRequirement) return false;
    return openRequirement;
  });
}

function pushMissing(text: string, missing: string[]): void {
  if (/\b(q[1-4]|parked|month-end)\b/i.test(text)) {
    missing.push("An exact close date is not in the evidence.");
  }
  if (TECHNICAL.test(text) && (ABSENT.test(text) || DELAY.test(text))) {
    missing.push("The approver's own position is secondhand when they were not in the evidence.");
  }
}

/** Read the primary constraint from supplied text. Does not invent missing facts. */
export function readConstraint(text: string): ConstraintReading {
  const raw = text.replace(/\s+/g, " ").trim();
  const technical = confirmedTechnical(raw);
  const budgetNeg = BUDGET_NEG.test(raw);
  const budgetOk = BUDGET_OK.test(raw);
  const department = procurementBlock(raw);
  const rejection = REJECTION.test(raw);
  const delay = DELAY.test(raw);
  const absent = ABSENT.test(raw);
  const opposition = OPPOSITION.test(raw);
  const financial = FINANCIAL_APPROVAL.test(raw);
  const signalCount = [technical, budgetNeg, department, rejection, delay, absent, opposition, budgetOk, financial].filter(
    Boolean
  ).length;

  if (raw.length < 80 && signalCount === 0) {
    return {
      kind: "insufficient_evidence",
      label: "There is not enough evidence to judge recoverability.",
      observed: [],
      interpretation: "Missing information is not evidence of a problem.",
      missing: ["A transcript, email, or note that states the blocker, the buyer, and any next step."],
      blockers: [],
    };
  }

  const observed: string[] = [];
  if (technical) observed.push("The evidence describes a technical approval that is still open.");
  if (budgetOk) observed.push("Budget is described as modeled, approved, or not the main obstacle.");
  if (budgetNeg) observed.push("The evidence states a budget or price objection.");
  if (financial) {
    observed.push("The evidence describes a spending freeze or a financial case that is not yet approved.");
  }
  if (department) observed.push("Legal, procurement, security, or compliance still has an open requirement.");
  if (delay) observed.push("A meeting was missed, delayed, or not yet rescheduled.");
  if (absent) observed.push("A named person was not in the evidence.");
  if (rejection) observed.push("The evidence states that the proposal was declined.");
  if (opposition) observed.push("The evidence states active opposition.");

  const missing: string[] = [];
  pushMissing(raw, missing);

  if (budgetOk && budgetNeg) {
    return {
      kind: "conflicting_statements",
      label: "The evidence conflicts on budget or commitment.",
      observed,
      interpretation: "Both statements stay visible. Neither one is dropped to force a single story.",
      missing,
      blockers: ["conflicting stakeholder statements"],
    };
  }

  if (rejection) {
    return {
      kind: "confirmed_rejection",
      label: "The proposal has been declined.",
      observed,
      interpretation: "A decline is different from a missed meeting, a missing approver, or an open review.",
      missing,
      blockers: ["confirmed rejection"],
    };
  }

  const blockers: string[] = [];
  if (technical) blockers.push("technical approval");
  if (department) blockers.push("procurement, legal, security, or compliance approval");
  if (financial) blockers.push("financial approval");
  if (budgetNeg) blockers.push("budget resistance");
  if (blockers.length >= 2) {
    return {
      kind: "multiple_blockers",
      label: `More than one blocker is in the evidence: ${blockers.join(" and ")}.`,
      observed,
      interpretation: "Each blocker needs its own next step. One action does not clear the others.",
      missing,
      blockers,
    };
  }

  if (technical) {
    return {
      kind: "technical_approval",
      label: "Technical approval is the primary constraint.",
      observed,
      interpretation:
        "A missed meeting or an absent approver is not, by itself, buyer resistance or a rejection. Budget language that says the amount is modeled is not budget resistance.",
      missing,
      blockers,
    };
  }

  if (department) {
    return {
      kind: "procurement_or_legal",
      label: "An open legal, procurement, security, or compliance requirement is the primary constraint.",
      observed,
      interpretation: "The department is named because the evidence states an open requirement, not because a technical person was absent.",
      missing,
      blockers,
    };
  }

  if (financial) {
    return {
      kind: "financial_approval",
      label:
        "Financial approval is the primary constraint. The evidence requires more approval or a defensible case. It does not show that the purchase is prohibited.",
      observed,
      interpretation:
        "A spending freeze that needs additional approval is not a ban. An anticipated security, integration, or architecture review is not an open legal, procurement, or security block unless that requirement is stated as unresolved and blocking.",
      missing,
      blockers,
    };
  }

  if (budgetNeg) {
    return {
      kind: "budget_resistance",
      label: "Budget or price resistance is the primary constraint.",
      observed,
      interpretation: "This is a commercial objection stated in the evidence, not a stand-in for a missing technical approver.",
      missing,
      blockers,
    };
  }

  if (opposition) {
    return {
      kind: "active_opposition",
      label: "The evidence describes active opposition.",
      observed,
      interpretation: "Opposition is stated. It is not inferred from a delayed meeting or from someone who was simply absent.",
      missing,
      blockers: ["active opposition"],
    };
  }

  if (delay) {
    return {
      kind: "delayed_meeting",
      label: "The evidence shows a delayed meeting, not a rejected deal.",
      observed,
      interpretation: "A missed or rescheduled meeting is not buyer resistance unless the evidence also states a refusal.",
      missing,
      blockers: [],
    };
  }

  if (absent) {
    return {
      kind: "absent_stakeholder",
      label: "A required person is absent from the evidence.",
      observed,
      interpretation: "Absence is not opposition, a veto, or a rejection. Their position is unknown until they are heard.",
      missing: missing.concat("That person's own position is not in the evidence."),
      blockers: [],
    };
  }

  return {
    kind: "unspecified",
    label: "The evidence does not isolate one primary constraint.",
    observed,
    interpretation: "No constraint is invented to fill the gap.",
    missing,
    blockers: [],
  };
}
