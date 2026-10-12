import { readFileSync } from "fs";
import { explainScores, deriveCanonicalState, buildDependencyGraph } from "../server/scoring.ts";
import { attributeQuote, peopleMapRows } from "../src/lib/evidenceAttribution.ts";
import { checkpointLine } from "../src/lib/checkpointTiming.ts";
import { pipelineReading } from "../src/lib/pipelineReading.ts";
import { intentInputTrace } from "../src/lib/scoreInputTrace.ts";
import { convergenceExplanation, viabilityCycleDisplay } from "../src/lib/convergenceNote.ts";
import { dependencyRelationships } from "../src/lib/forceGraph.ts";
import {
  formatRecoveryAction,
  recoveryActionLines,
  recoveryActionNote,
  uniqueRecoveryNotes,
} from "../src/lib/recoveryPlan.ts";
import { preserveTriggerEstimate, triggerLikelihood } from "../src/lib/triggerEstimate.ts";

let failed = false;

function check(name, ok, detail) {
  if (ok) {
    console.log("ok", name);
    return;
  }
  failed = true;
  console.error("FAIL:", name, detail ?? "");
}

function labelCount(lines, label) {
  const pattern = new RegExp(`^${label}:`, "i");
  return lines.filter((line) => pattern.test(line)).length;
}

const activity =
  "P1 | Owner: Sarah Chen | Stakeholder: Dave | Action: Propose 3 meeting slots after month-end | Outcome: Demo with Dave is scheduled | Progress evidence: Calendar invite accepted | Checkpoint: Unknown | Kind: activity";
const outcome =
  "P2 | Owner: Sarah Chen | Stakeholder: Dave | Action: Confirm the technical approval criteria with Dave | Outcome: Dave agrees the approval criteria | Progress evidence: Written criteria from Dave | Checkpoint: after month-end | Kind: outcome";

const activityLines = recoveryActionLines(activity);
const outcomeLines = recoveryActionLines(outcome);
const activityNote = recoveryActionNote(activity);

check("northline activity keeps one owner", labelCount(activityLines, "Owner") === 1, activityLines);
check("northline activity keeps one stakeholder", labelCount(activityLines, "Stakeholder") === 1, activityLines);
check(
  "northline activity keeps one progress line",
  activityLines.filter((line) => /progress|not yet observed/i.test(line)).length === 1,
  activityLines
);
check("northline activity omits an unknown checkpoint", labelCount(activityLines, "Checkpoint") === 0, activityLines);
check("northline activity does not print Unknown", !activityLines.some((line) => /unknown/i.test(line)), activityLines);
check("northline activity kind is one compact label", activityLines.filter((line) => line === "Activity").length === 1, activityLines);
check("scheduling stays an activity", formatRecoveryAction(activity).kind === "activity", formatRecoveryAction(activity));
check("the action sentence is not repeated", activityLines.filter((line) => line.startsWith("Propose 3")).length === 1);
check("the raw pipe string is not the rendered note", !activityNote.includes("|"));
check(
  "rendering the note again does not append the fields",
  labelCount(recoveryActionLines(activityNote), "Owner") === 1 &&
    recoveryActionLines(activityNote).filter((line) => line === "Activity").length === 1,
  recoveryActionLines(activityNote)
);

check("northline outcome checkpoint appears once", labelCount(outcomeLines, "Checkpoint") === 1, outcomeLines);
check("northline outcome kind is one compact label", outcomeLines.filter((line) => line === "Outcome").length === 1, outcomeLines);
check(
  "agreement stays an outcome",
  formatRecoveryAction(outcome).kind === "outcome",
  formatRecoveryAction(outcome)
);
check("stated outcome text appears once", outcomeLines.filter((line) => /outcome:/i.test(line)).length === 1, outcomeLines);

const highWord = preserveTriggerEstimate("high");
const highLikelihood = triggerLikelihood(highWord);
check("a word estimate is not converted into a percentage", highWord === "high", highWord);
check("a word estimate renders as a qualitative label", highLikelihood.label === "High" && highLikelihood.showsNumericProbability === false);
check("85 is not presented as a validated percentage", triggerLikelihood(85).label === "High" && triggerLikelihood(85).showsNumericProbability === false);
check("a missing estimate is not invented as 50", preserveTriggerEstimate(undefined) === "" && triggerLikelihood("").label === "Not stated");
check(
  "the rendered likelihood does not contain a percent sign",
  !/\%/.test(`${triggerLikelihood(85).label} ${triggerLikelihood("medium").label}`)
);

const emptyGraph = buildDependencyGraph([
  {
    factor: "VP of Infrastructure Approval Required",
    type: "Constraint",
    weight: 90,
    role: "parent",
    evidence: "Dave is the one who signs off.",
  },
]);
const emptyView = dependencyRelationships(emptyGraph);
check("a parent with no children is not an empty generates line", emptyView.status === "unavailable" && emptyView.edges.length === 0, emptyView);

const linkedGraph = buildDependencyGraph([
  {
    factor: "Technical approval",
    type: "Structural",
    weight: 80,
    role: "parent",
    evidence: "Dave has not signed off.",
  },
  {
    factor: "Demo delay",
    type: "Behavioral",
    weight: 40,
    role: "derivative",
    derived_from: ["Technical approval"],
    evidence: "The demo was missed.",
  },
]);
const linkedView = dependencyRelationships(linkedGraph);
check(
  "a real dependency edge is preserved",
  linkedView.status === "edges" && linkedView.edges[0]?.generates.includes("Demo delay"),
  linkedView
);
check("missing graph data is unavailable", dependencyRelationships(null).status === "unavailable");
check(
  "a parent with no generates array is unavailable",
  dependencyRelationships({ parent_forces: [{ force: "VP of Infrastructure Approval Required" }] }).status === "unavailable"
);

const frozen = deriveCanonicalState(
  [
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
  ],
  "TEMPORARY BLOCKERS"
).frozen;

check("a finished derivation is marked converged", frozen.resolution_cycles.convergence_status === "converged");
check("convergence can still leave the deal deferred", frozen.trajectory_type === "DEFERRED (recoverable)", frozen.trajectory_type);
check("convergence can still leave equilibrium open", frozen.equilibrium_state === "OPEN", frozen.equilibrium_state);
const note = convergenceExplanation({
  convergenceStatus: frozen.resolution_cycles.convergence_status,
  totalCycles: frozen.resolution_cycles.total_cycles,
  equilibrium: frozen.equilibrium_state,
  trajectory: frozen.trajectory_type,
});
check("convergence copy does not claim buyer approval", /does not mean the buyer approved/i.test(note ?? ""), note);
check("the final cycle is the frozen viability", frozen.resolution_cycles.cycles.at(-1).state_snapshot.viability_score === frozen.viability_score);
check(
  "cycle 1 is an intermediate calculation",
  /intermediate/i.test(frozen.resolution_cycles.cycles[0].state_change)
);

const display = viabilityCycleDisplay(frozen.resolution_cycles.cycles, frozen.viability_score);
check("the displayed final score is the frozen score", display.final === frozen.viability_score, display);
if (display.intermediate !== null) {
  check("an earlier cycle is labeled intermediate rather than replacing the final score", display.intermediate !== display.final, display);
}

check(
  "a reschedule is not upgraded to an outcome",
  formatRecoveryAction(
    "Action: Reschedule the technical demo with Dave | Outcome: Dave attends | Kind: outcome"
  ).kind === "activity"
);

const collapsed = uniqueRecoveryNotes([
  "01 [Immediate]: Reschedule technical deep-dive with Dave, VP of Infrastructure, for after month-end",
  "P1 | Owner: Sarah Chen | Stakeholder: Dave | Action: Reschedule technical deep-dive with Dave, VP of Infrastructure | Outcome: Dave attends the rescheduled meeting | Progress evidence: Calendar invite accepted | Checkpoint: after month-end | Kind: outcome",
]);
check("near-duplicate northline actions collapse to one note", collapsed.length === 1, collapsed);
check("the kept note has the owner once", labelCount(collapsed[0].split("\n"), "Owner") === 1, collapsed);
check("the kept reschedule stays an activity", collapsed[0].split("\n").includes("Activity"), collapsed);

const confirmed = recoveryActionLines(
  "Action: Propose 3 meeting slots after month-end | Outcome: Dave reviews the document and agrees to a follow-up | Progress evidence: Confirmed meeting with Dave | Kind: activity"
);
check(
  "a proposed meeting is not described as already confirmed",
  confirmed.some((line) => line.startsWith("Required, not yet observed:")) &&
    !confirmed.some((line) => line === "Progress evidence: Confirmed meeting with Dave"),
  confirmed
);
check("the action's current status stays proposed", confirmed.includes("Current status: Proposed"), confirmed);

const held = recoveryActionLines(
  "Action: Hold the technical review | Outcome: Architectural validation and path forward agreed | Progress evidence: A meeting was held and approval action items were identified | Kind: activity"
);
check(
  "a future review is not described as a meeting already held",
  held.some((line) => /not yet observed/i.test(line) && /was held/i.test(line)),
  held
);

const stale = checkpointLine("After month-end (March 2026)", new Date("2026-10-12T12:00:00"));
check("a past source month is not a future checkpoint", /in the past/i.test(stale) && !stale.startsWith("Checkpoint:"), stale);
check(
  "a past checkpoint is not replaced with a new date",
  !/october|2026-10/i.test(stale),
  stale
);

const northlineText = readFileSync("fixtures/sarah_mark_transcript.txt", "utf8");
const daveQuote =
  "Dave, our VP of Infrastructure, missed the technical demo yesterday. He wasn't on the call, so nothing's approved on the infrastructure side yet.";
const daveAttribution = attributeQuote(northlineText, "Dave", daveQuote);
check("Dave's quote is attributed to Mark", daveAttribution.speaker === "Mark O'Brien", daveAttribution);
check("Dave's quote is secondhand", daveAttribution.basis === "secondhand", daveAttribution);

const rows = peopleMapRows([
  {
    name: "Mark O'Brien",
    role: "Director of Operations",
    persona_type: "Aligned Champion",
    evidence: "I like what I saw in the overview.",
    evidence_speaker: "Mark O'Brien",
    evidence_basis: "firsthand",
  },
  {
    name: "Dave",
    role: "VP of Infrastructure",
    persona_type: "Absent Decision Maker",
    evidence: daveQuote,
    evidence_speaker: daveAttribution.speaker ?? "",
    evidence_basis: daveAttribution.basis,
  },
]);
const mark = rows.find((row) => row.name === "Mark O'Brien");
const dave = rows.find((row) => row.name === "Dave");
check(
  "Mark's words stay on Mark's row",
  mark.quotes.some((quote) => /wasn't on the call/i.test(quote.text)) &&
    mark.quotes.some((quote) => /About Dave/i.test(quote.note)),
  mark
);
check(
  "Dave's row does not present Mark's sentence as Dave's words",
  dave.quotes.length === 0 && /No firsthand statement/i.test(dave.secondhandNote ?? ""),
  dave
);

const reading = pipelineReading({
  currentStatus: "STALLED — RECOVERABLE",
  qualification: "SHOULD HAVE BEEN DEFERRED",
  stageChange: "Discovery to Technical Validation",
  optimalDecision: "Defer until Dave's technical requirements and availability are confirmed.",
});
check("current status stays the scored state", reading.currentStatus === "STALLED — RECOVERABLE");
check("deferral is labeled as qualification, not a second status", reading.qualification === "SHOULD HAVE BEEN DEFERRED");
check(
  "the pipeline note keeps status and recommendation apart",
  /not a second status/i.test(reading.note) && !/dead|rejected/i.test(reading.note)
);

const openInputs = deriveCanonicalState(
  [
    { factor: "Buying interest", type: "Intent", weight: 50, evidence: "I like what I saw in the overview." },
    { factor: "Technical sign-off", type: "Constraint", weight: 80, evidence: "He's the one who signs off on anything that routes near our OT network." },
    { factor: "Budget in range", type: "Enabler", weight: 60, evidence: "The $280,000 annual platform fee was in range." },
    { factor: "Month-end timing", type: "Timing", weight: 40, evidence: "underwater until month-end" },
  ],
  "TEMPORARY BLOCKERS",
  "missed the technical demo and asked to reschedule"
).frozen;
const pinnedInputs = deriveCanonicalState(
  [
    { factor: "Dave technical veto", type: "Structural", weight: 95, evidence: "He's the one who signs off on anything that routes near our OT network." },
    { factor: "Technical approval outstanding", type: "Constraint", weight: 90, evidence: "nothing's approved on the infrastructure side yet" },
    { factor: "Budget in range", type: "Enabler", weight: 80, evidence: "$280K is what we modeled" },
    { factor: "Month-end timing", type: "Timing", weight: 40, evidence: "underwater until month-end" },
  ],
  "TEMPORARY BLOCKERS",
  "missed the technical demo and asked to reschedule"
).frozen;
check("the earlier input set stays open", openInputs.equilibrium_state === "OPEN" && openInputs.structural_lock_in === 0, openInputs);
check(
  "the earlier weights produce the higher viability",
  openInputs.viability_score === 57 && openInputs.effective_intent === 13,
  { viability: openInputs.viability_score, effective: openInputs.effective_intent, structural: openInputs.structural_lock_in }
);
check(
  "the later input set is pinned by the extracted weights",
  pinnedInputs.equilibrium_state === "PINNED" &&
    pinnedInputs.structural_lock_in === 95 &&
    pinnedInputs.constraint_pressure === 90,
  pinnedInputs
);
check("the later input set has no extracted intent", pinnedInputs.intent_strength === 0 && pinnedInputs.effective_intent === 0, pinnedInputs);
check(
  "viability changed because the inputs changed",
  openInputs.viability_score !== pinnedInputs.viability_score && pinnedInputs.viability_score === 18,
  { open: openInputs.viability_score, pinned: pinnedInputs.viability_score }
);
const zeroTrace = intentInputTrace(0, pinnedInputs.constraint_pressure, pinnedInputs.effective_intent);
check("zero raw intent is not described as no interest", /not a finding that the buyer has no interest/i.test(zeroTrace), zeroTrace);
const explained = explainScores(
  pinnedInputs,
  {
    index: 0,
    authority_gap: false,
    multi_department_friction: 0,
    persona_breakdown: {},
    department_mentions: [],
    absence_term_applied: false,
    flags: [],
  },
  {
    score: 0,
    deferral_phrase_count: 0,
    handoff_mention_count: 0,
    rep_monologue_ratio: null,
    avg_turn_gap_seconds: null,
    flagged_patterns: [],
    observed_patterns: [],
    inferred_patterns: [],
  },
  "TEMPORARY BLOCKERS"
);
check(
  "the score explanation traces raw intent separately",
  explained.viability.factors.some((factor) => /no Intent force was extracted/i.test(factor.text))
);

if (failed) process.exit(1);
console.log("report integrity regression passed");
