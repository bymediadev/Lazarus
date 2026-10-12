import { readFileSync } from "fs";
import { explainScores } from "../server/scoring.ts";
import { readConstraint } from "../src/lib/constraintReading.ts";
import { formatRecoveryAction } from "../src/lib/recoveryPlan.ts";
import { deriveCanonicalState, deriveProprietaryIndices } from "../server/scoring.ts";

let failed = false;

function check(name, ok, detail) {
  if (ok) {
    console.log("ok", name);
    return;
  }
  failed = true;
  console.error("FAIL:", name, detail ?? "");
}

const northline = readFileSync("fixtures/sarah_mark_transcript.txt", "utf-8");
const northlineReading = readConstraint(northline);
check(
  "reference scenario is a technical approval",
  northlineReading.kind === "technical_approval",
  northlineReading
);
check(
  "reference scenario does not treat the missed meeting as a rejection",
  !/rejection|disinterest|budget resistance/i.test(northlineReading.label),
  northlineReading.label
);
check(
  "reference scenario keeps the budget distinction",
  northlineReading.interpretation.toLowerCase().includes("not budget resistance"),
  northlineReading.interpretation
);
check(
  "reference scenario does not invent a close date",
  northlineReading.missing.some((line) => /close date/i.test(line)),
  northlineReading.missing
);

const cases = [
  {
    name: "budget resistance",
    text: "The annual fee is too expensive and we have no budget. Please send a cheaper option before we can continue the evaluation this quarter.",
    kind: "budget_resistance",
  },
  {
    name: "procurement or legal approval",
    text: "Legal must review the MSA, and procurement will not issue a purchase order until that review is finished. Nothing else is blocking the evaluation.",
    kind: "procurement_or_legal",
  },
  {
    name: "explicit rejection",
    text: "We have decided not to move forward. The proposal is rejected, and the team will not buy this platform.",
    kind: "confirmed_rejection",
  },
  {
    name: "delayed meeting only",
    text: "Sorry, Dave couldn't join because of a P1 outage. Can we reschedule next week? He is interested and asked us to hold the slot.",
    kind: "delayed_meeting",
  },
  {
    name: "insufficient evidence",
    text: "Thanks for the call.",
    kind: "insufficient_evidence",
  },
  {
    name: "conflicting statements",
    text: "Finance approved the budget yesterday and said the fee was in range. Finance also said there is no budget and we cannot afford the fee.",
    kind: "conflicting_statements",
  },
  {
    name: "multiple blockers",
    text: "Dave has not signed off on the OT network architecture. Legal must review the MSA before procurement will proceed with the contract.",
    kind: "multiple_blockers",
  },
  {
    name: "absence is not opposition",
    text: "Dave was not on the call. Nobody has stated his position, and nobody has declined the proposal or named another blocker in this note.",
    kind: "absent_stakeholder",
  },
];

for (const item of cases) {
  const reading = readConstraint(item.text);
  check(item.name, reading.kind === item.kind, reading);
}

check(
  "completed legal signature is not an open legal block",
  readConstraint(
    "Legal signed off this morning. Procurement issued the PO for Phase 1. The contract is executed and the budget was pre-approved."
  ).kind !== "procurement_or_legal"
);

const forces = [
  {
    factor: "VP of Infrastructure sign-off",
    type: "Constraint",
    weight: 90,
    evidence: "Dave is the one who signs off on the OT network.",
  },
  {
    factor: "Budget modeled in range",
    type: "Enabler",
    weight: 60,
    evidence: "The platform fee was in range.",
  },
  {
    factor: "Timeline if the veto holder buys in",
    type: "Intent",
    weight: 50,
    evidence: "If the veto holder buys in, the timeline can move.",
  },
];
const frozen = deriveCanonicalState(forces, "TEMPORARY BLOCKERS").frozen;
const indices = deriveProprietaryIndices(
  frozen,
  [
    {
      name: "Dave",
      persona_type: "Hidden Detractor",
      role: "VP of Infrastructure",
      evidence: "missed the technical demo",
    },
    {
      name: "Mark",
      persona_type: "Aligned Champion",
      role: "Finance partner",
      evidence: "budget modeled",
    },
  ],
  ["missed the", "reschedule", "couldn't join", "hasn't validated", "if not", "procurement"].join("\n"),
  "TEMPORARY BLOCKERS"
);
const explained = explainScores(
  frozen,
  indices.stakeholder_dispersion,
  indices.dialogue_stall,
  "TEMPORARY BLOCKERS"
);
check("explanations match the attached score account", explained.viability.metric === indices.explanations.viability.metric);
check(
  "viability explanation does not pretend stakeholder access is its own term",
  /not its own term/i.test(explained.viability.summary)
);
check(
  "deal risk explanation is not a close probability",
  /not a close probability/i.test(explained.deal_risk.summary)
);
check(
  "department friction lists the departments that were actually matched",
  explained.department_friction.factors.some((factor) => /infrastructure/i.test(factor.text) && /finance/i.test(factor.text))
);
check(
  "department friction does not invent Legal resistance from this map",
  !explained.department_friction.factors.some((factor) => /Legal is resisting/i.test(factor.text)) &&
    /not implied|not evidence that Legal|not a finding of resistance/i.test(
      `${explained.department_friction.factors.map((factor) => factor.text).join(" ")} ${explained.department_friction.caveat}`
    )
);
check(
  "stall explanation separates a delay from a rejection",
  /not a rejection/i.test(`${explained.stall.summary} ${explained.stall.caveat}`)
);
check(
  "dispersion stays on the supplied stakeholder list",
  /supplied stakeholder list/i.test(explained.dispersion.summary)
);

const structured = formatRecoveryAction(
  "P1 | Owner: Sarah Chen | Stakeholder: Dave | Action: Send the technical brief | Outcome: Agreement on the technical approval criteria | Progress evidence: Dave confirms the criteria | Checkpoint: after month-end | Kind: activity and outcome"
);
check("structured action keeps the stated owner", structured.owner === "Sarah Chen", structured);
check("structured action keeps the stated checkpoint", structured.checkpoint === "after month-end", structured);
check("structured action can carry both an activity and an outcome", structured.kind === "mixed", structured);

const thin = formatRecoveryAction("Schedule a technical demo with Dave.");
check("scheduling is an activity", thin.kind === "activity", thin);
check(
  "an unstructured action does not invent a deadline",
  thin.checkpoint === null && thin.missing.includes("checkpoint"),
  thin
);

const outcome = formatRecoveryAction("Obtain agreement on the technical approval criteria.");
check("agreement is an outcome", outcome.kind === "outcome", outcome);

if (failed) {
  process.exit(1);
}
console.log("constraint regression passed");
