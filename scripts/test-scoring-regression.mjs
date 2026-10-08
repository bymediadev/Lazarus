import {
  deriveCanonicalState,
  deriveProprietaryIndices,
  compileDealRiskReport,
  computeDialogueStallSignals,
  lockForcesToTranscript,
} from "../server/scoring.ts";
import { statusFromTrajectory } from "../server/gemini.ts";
import { commercialBaselineFromText } from "../src/lib/commercialBaseline.ts";
import { forecastGuidance, NON_VIABLE_FORECAST_LINE } from "../src/lib/forecastCall.ts";
import { mergeOverlappingQuotes } from "../src/lib/evidenceQuotes.ts";
import { readFileSync } from "fs";

// Transcript 1 — velocity / closed-won (pre-approved budget must NOT crush viability)
const velocityForces = [
  {
    factor: "Board pre-approved budget at 95% confidence",
    type: "Enabler",
    weight: 95,
    evidence: "board pre-approved the full $320,000 annual platform budget last week. Finance gave us a 95% confidence allocation",
  },
  {
    factor: "Legal signed and PO issued",
    type: "Enabler",
    weight: 90,
    evidence: "Legal signed off this morning. Procurement issued the PO for Phase 1",
  },
  {
    factor: "CEO mandate to accelerate",
    type: "Intent",
    weight: 88,
    evidence: "My CEO asked me to accelerate — she wants this live before Q2 close",
  },
  {
    factor: "Contract executed — closed won",
    type: "Intent",
    weight: 92,
    evidence: "Contract is executed. We are closed-won from our perspective",
  },
];

const velocityStakeholders = [
  { name: "CEO", persona_type: "Aligned Champion", role: "Executive sponsor" },
];

// Transcript 3 — federal audit stall (time-bound constraint)
const auditForces = [
  {
    factor: "Mandatory federal audit freeze",
    type: "Constraint",
    weight: 88,
    evidence: "we are in the middle of a mandatory federal audit window. Nothing over $200K gets signed until audit closes",
  },
  {
    factor: "Procurement frozen 90 days",
    type: "Structural",
    weight: 85,
    evidence: "Legal and procurement are frozen for the next 90 days",
  },
  {
    factor: "CFO Richard holds signing authority — absent",
    type: "Behavioral",
    weight: 75,
    evidence: "I do not have signing authority — that sits with our CFO, Richard, who is not on this call",
  },
  {
    factor: "Dave IT security no-show",
    type: "Behavioral",
    weight: 60,
    evidence: "Dave from IT security also flagged concerns about data residency — he missed today's session",
  },
  {
    factor: "Interest in principle",
    type: "Intent",
    weight: 55,
    evidence: "we like the platform, but I need to be direct",
  },
];

const auditStakeholders = [
  { name: "Richard", persona_type: "Absent Decision Maker", role: "CFO" },
  { name: "Dave", persona_type: "Hidden Detractor", role: "IT Security" },
];

// Sarah/Mark — authority gap, Dave absent
const sarahMarkForces = [
  {
    factor: "Dave VP Infrastructure absent — architecture gate",
    type: "Constraint",
    weight: 72,
    evidence: "Dave, our VP of Infrastructure, missed the technical demo yesterday",
  },
  {
    factor: "Cannot proceed without Dave sign-off",
    type: "Structural",
    weight: 68,
    evidence: "Without him, I'm not moving this forward",
  },
  {
    factor: "Interest in platform",
    type: "Intent",
    weight: 62,
    evidence: "I like what I saw in the overview",
  },
  {
    factor: "Budget in range",
    type: "Enabler",
    weight: 45,
    evidence: "$280,000 annual platform fee was in range",
  },
];

const sarahMarkStakeholders = [
  { name: "Dave", persona_type: "Absent Decision Maker", role: "VP of Infrastructure" },
  { name: "Mark", persona_type: "Suppressed Champion", role: "Director of Operations" },
];

const sarahMarkTranscript = readFileSync("fixtures/sarah_mark_transcript.txt", "utf-8");

const vState = deriveCanonicalState(velocityForces, "MIXED");
const aState = deriveCanonicalState(auditForces, "TEMPORARY BLOCKERS");
const sState = deriveCanonicalState(sarahMarkForces, "MIXED");

const v = vState.frozen;
const a = aState.frozen;
const s = sState.frozen;

const vPi = deriveProprietaryIndices(v, velocityStakeholders, "");
const aPi = deriveProprietaryIndices(a, auditStakeholders, "");
const sPi = deriveProprietaryIndices(s, sarahMarkStakeholders, sarahMarkTranscript);

console.log("=== Transcript 1: Velocity Deal ===");
console.log("  viability:", v.viability_score, "trajectory:", v.trajectory_type, "DRI:", vPi.deal_risk_index, vPi.risk_tier);

console.log("\n=== Transcript 3: Federal Audit Stall ===");
console.log("  viability:", a.viability_score, "trajectory:", a.trajectory_type, "DRI:", aPi.deal_risk_index, aPi.risk_tier);

console.log("\n=== Sarah/Mark: Authority Gap ===");
console.log("  viability:", s.viability_score, "trajectory:", s.trajectory_type, "DRI:", sPi.deal_risk_index, sPi.risk_tier);
console.log("  dispersion:", sPi.stakeholder_dispersion_index, "stall:", sPi.dialogue_stall_score);
console.log("  authority_gap:", sPi.authority_gap_flag);

let failed = false;

if (v.viability_score < 70) {
  console.error("FAIL: Velocity deal viability should be >= 70, got", v.viability_score);
  failed = true;
}
if (v.trajectory_type !== "VALIDATED / VELOCITY") {
  console.error("FAIL: Velocity trajectory should be VALIDATED / VELOCITY, got", v.trajectory_type);
  failed = true;
}

if (a.viability_score > 40) {
  console.error("FAIL: Audit stall viability should be <= 40, got", a.viability_score);
  failed = true;
}
if (!a.trajectory_type.includes("DEFERRED")) {
  console.error("FAIL: Audit trajectory should be DEFERRED, got", a.trajectory_type);
  failed = true;
}
if (a.constraint_pressure < 70) {
  console.error("FAIL: Audit constraint should be >= 70, got", a.constraint_pressure);
  failed = true;
}

if (vPi.deal_risk_index >= sPi.deal_risk_index) {
  console.error("FAIL: Velocity DRI should be < Sarah/Mark DRI", vPi.deal_risk_index, sPi.deal_risk_index);
  failed = true;
}
if (s.trajectory_type !== "DEFERRED (recoverable)") {
  console.error("FAIL: Sarah/Mark trajectory should be DEFERRED (recoverable), got", s.trajectory_type);
  failed = true;
}
if (s.viability_score < 30 || s.viability_score > 55) {
  console.error("FAIL: Sarah/Mark viability should be 30-55, got", s.viability_score);
  failed = true;
}
if (sPi.deal_risk_index >= aPi.deal_risk_index) {
  console.error("FAIL: Sarah/Mark DRI should be < Audit DRI", sPi.deal_risk_index, aPi.deal_risk_index);
  failed = true;
}
if (vPi.deal_risk_index >= 35) {
  console.error("FAIL: Velocity DRI should be LOW (<35), got", vPi.deal_risk_index);
  failed = true;
}
if (aPi.deal_risk_index < 55) {
  console.error("FAIL: Audit DRI should be HIGH (>=55), got", aPi.deal_risk_index);
  failed = true;
}
if (sPi.deal_risk_index >= 75) {
  console.error("FAIL: Sarah/Mark DRI should be below CRITICAL (<75), got", sPi.deal_risk_index);
  failed = true;
}
if (sPi.deal_risk_index < 45) {
  console.error("FAIL: Sarah/Mark DRI should be >= 45 (authority gap), got", sPi.deal_risk_index);
  failed = true;
}
if (!sPi.authority_gap_flag) {
  console.error("FAIL: Sarah/Mark should flag authority gap");
  failed = true;
}

const stall = computeDialogueStallSignals(sarahMarkTranscript);
if (stall.deferral_phrase_count < 2) {
  console.error("FAIL: Sarah/Mark transcript should detect deferral phrases, got", stall.deferral_phrase_count);
  failed = true;
}

const alexTranscript = [
  "David: It's higher than I thought.",
  "David: Not necessarily impossible.",
  "David: I just need to justify it.",
  "David: If this can absorb some of that workload, that's a much stronger argument internally.",
  "David: I buy it if it helps me run the operation with fewer resources.",
].join("\n");
const alexRunA = [
  { factor: "Budget gap", type: "Constraint", weight: 70, evidence: "It's higher than I thought." },
  { factor: "COO justification", type: "Behavioral", weight: 80, evidence: "I need to show reduced operating costs." },
  { factor: "Headcount", type: "Intent", weight: 85, evidence: "not add another operations analyst" },
  { factor: "ROI offer", type: "Enabler", weight: 60, evidence: "We can put together an ROI model." },
];
const alexRunB = [
  { factor: "Budget Expectation Gap", type: "Constraint", weight: 75, evidence: "It's higher than I thought." },
  { factor: "Need for ROI Justification", type: "Constraint", weight: 90, evidence: "I just need to justify it." },
  { factor: "Headcount Avoidance Mandate", type: "Constraint", weight: 85, evidence: "not add another operations analyst" },
  { factor: "Platform value", type: "Enabler", weight: 80, evidence: "The platform itself is impressive." },
  { factor: "Efficiency", type: "Intent", weight: 90, evidence: "fewer resources" },
];
const alexA = deriveCanonicalState(lockForcesToTranscript(alexTranscript, alexRunA), "MIXED").frozen;
const alexB = deriveCanonicalState(lockForcesToTranscript(alexTranscript, alexRunB), "MIXED").frozen;
if (alexA.viability_score !== alexB.viability_score) {
  console.error("FAIL: same transcript produced", alexA.viability_score, "and", alexB.viability_score);
  failed = true;
}
if (alexA.viability_score < 50 || alexA.viability_score > 70) {
  console.error("FAIL: conditional-buy viability should stay recoverable, got", alexA.viability_score);
  failed = true;
}
if (lockForcesToTranscript(sarahMarkTranscript, sarahMarkForces) !== sarahMarkForces) {
  console.error("FAIL: authority-gap transcript should keep its own forces");
  failed = true;
}

function replayViability(transcript, forces) {
  return deriveCanonicalState(lockForcesToTranscript(transcript, forces), "MIXED").frozen.viability_score;
}
const approvedTranscript = `${alexTranscript}\nDavid: Finance approved the budget and legal signed off.`;
const setbackTranscript = `${alexTranscript}\nDavid: David went dark and is evaluating a competitor.`;
const stoppedTranscript = `${alexTranscript}\nDavid: Procurement is frozen until the audit closes.`;
const approvedScore = replayViability(approvedTranscript, alexRunA);
const setbackScore = replayViability(setbackTranscript, alexRunA);
const stoppedScore = replayViability(stoppedTranscript, alexRunB);
if (approvedScore <= alexA.viability_score) {
  console.error("FAIL: budget approval should raise viability", alexA.viability_score, approvedScore);
  failed = true;
}
if (setbackScore >= alexA.viability_score) {
  console.error("FAIL: a stall should lower viability", alexA.viability_score, setbackScore);
  failed = true;
}
if (stoppedScore >= setbackScore) {
  console.error("FAIL: a freeze should score below a stall", setbackScore, stoppedScore);
  failed = true;
}
if (replayViability(approvedTranscript, alexRunB) !== approvedScore) {
  console.error("FAIL: the same added evidence produced two scores");
  failed = true;
}

function replayWithCrm(note, forces) {
  return deriveCanonicalState(lockForcesToTranscript(alexTranscript, forces, note), "MIXED").frozen
    .viability_score;
}
const salesforceApproved = replayWithCrm(
  "Salesforce: Finance approved the budget and legal signed off.",
  alexRunA
);
const hubspotDark = replayWithCrm(
  "HubSpot: The buyer went dark and is talking to a competitor.",
  alexRunA
);
const salesforceFrozen = replayWithCrm(
  "Salesforce: Procurement is frozen until the audit closes.",
  alexRunB
);
const pilotNote = "Salesforce meeting: The COO asked us to start a paid pilot next month.";
const pilotUp = replayWithCrm(pilotNote, [
  {
    factor: "Paid pilot",
    type: "Intent",
    weight: 42,
    evidence: "The COO asked us to start a paid pilot next month.",
  },
]);
const pilotDown = replayWithCrm(pilotNote, [
  {
    factor: "Paid pilot blocked",
    type: "Constraint",
    weight: 99,
    evidence: "The COO asked us to start a paid pilot next month.",
  },
]);
if (salesforceApproved <= alexA.viability_score) {
  console.error("FAIL: a Salesforce approval note should raise viability", salesforceApproved);
  failed = true;
}
if (hubspotDark >= alexA.viability_score) {
  console.error("FAIL: a HubSpot stall note should lower viability", hubspotDark);
  failed = true;
}
if (salesforceFrozen >= hubspotDark) {
  console.error("FAIL: a Salesforce freeze should score below a stall", salesforceFrozen);
  failed = true;
}
if (pilotUp <= alexA.viability_score || pilotDown >= alexA.viability_score) {
  console.error("FAIL: the engine reading of a new meeting should move viability", pilotUp, pilotDown);
  failed = true;
}
if (replayWithCrm(pilotNote, [
  {
    factor: "Paid pilot",
    type: "Intent",
    weight: 10,
    evidence: "The COO asked us to start a paid pilot next month.",
  },
]) !== pilotUp) {
  console.error("FAIL: the same meeting note and engine reading produced two scores");
  failed = true;
}

function cycleViabilities(frozen) {
  return (frozen.resolution_cycles?.cycles ?? []).map((cycle) => cycle.state_snapshot?.viability_score);
}

function assertFlatRecoverablePath(label, scores) {
  if (scores.length !== 3 || scores.some((score) => !Number.isFinite(score))) {
    console.error(`FAIL: ${label} should plot three viability points, got`, scores);
    return false;
  }
  const spread = Math.max(...scores) - Math.min(...scores);
  if (scores.some((score) => score <= 0) || spread > 8 || scores[2] <= 0) {
    console.error(`FAIL: ${label} path should stay flat and above zero, got`, scores.join(" → "));
    return false;
  }
  return true;
}

function evalDriFormula(formula) {
  const rhs = formula.split("=")[1]?.split("|")[0] ?? "";
  const expr = rhs
    .replace(/timing_penalty\(10\)/g, "10")
    .replace(/×/g, "*")
    .replace(/−/g, "-")
    .trim();
  if (!/^[\d.+\-*\s()]+$/.test(expr)) {
    throw new Error(`Unparseable DRI formula: ${expr}`);
  }
  const value = Function(`"use strict"; return (${expr});`)();
  return Math.min(100, Math.max(0, Math.round(value)));
}

const northlineFixture = {
  constraint: 90,
  structural: 0,
  enabler: 60,
  intent: 50,
  dispersion: 23,
  stall: 89,
  timing_factor: 4,
  blockerClassification: "TEMPORARY BLOCKERS",
};

const northlineForces = [
  {
    factor: "VP of Infrastructure sign-off",
    type: "Constraint",
    weight: northlineFixture.constraint,
    evidence: "Dave is the one who signs off on the OT network.",
  },
  {
    factor: "Budget modeled in range",
    type: "Enabler",
    weight: northlineFixture.enabler,
    evidence: "The platform fee was in range.",
  },
  {
    factor: "Timeline if the veto holder buys in",
    type: "Intent",
    weight: northlineFixture.intent,
    evidence: "If the veto holder buys in, the timeline can move.",
  },
];

const northlineStakeholders = [
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
];

const northlineTranscript = [
  "missed the",
  "reschedule",
  "couldn't join",
  "loop in",
  "hasn't validated",
  "stays parked",
  "if not",
  "let me get back",
  "procurement finance operations compliance legal",
].join("\n");

const northline = deriveCanonicalState(
  northlineForces,
  northlineFixture.blockerClassification
).frozen;
const northlinePi = deriveProprietaryIndices(
  northline,
  northlineStakeholders,
  northlineTranscript
);

console.log("\n=== Northline: temporary authority gap ===");
console.log(
  "  viability:",
  northline.viability_score,
  "trajectory:",
  northline.trajectory_type,
  "DRI:",
  northlinePi.deal_risk_index
);
console.log("  formula:", northlinePi.formula);

if (northline.viability_score < 30 || northline.viability_score > 65) {
  console.error("FAIL: Northline viability should be 30-65, got", northline.viability_score);
  failed = true;
}
if (northline.trajectory_type !== "DEFERRED (recoverable)") {
  console.error("FAIL: Northline trajectory should be DEFERRED (recoverable), got", northline.trajectory_type);
  failed = true;
}
if (northline.structural_lock_in !== northlineFixture.structural) {
  console.error("FAIL: Northline structural should be 0, got", northline.structural_lock_in);
  failed = true;
}
if (northline.timing_factor > 5) {
  console.error("FAIL: Northline timing should stay in the penalty band, got", northline.timing_factor);
  failed = true;
}
if (northlinePi.stakeholder_dispersion_index !== northlineFixture.dispersion) {
  console.error(
    "FAIL: Northline dispersion should be 23, got",
    northlinePi.stakeholder_dispersion_index
  );
  failed = true;
}
if (northlinePi.dialogue_stall_score !== northlineFixture.stall) {
  console.error("FAIL: Northline stall should be 89, got", northlinePi.dialogue_stall_score);
  failed = true;
}
try {
  const evaluated = evalDriFormula(northlinePi.formula);
  if (evaluated !== northlinePi.deal_risk_index) {
    console.error(
      "FAIL: Northline DRI formula evaluated to",
      evaluated,
      "but index is",
      northlinePi.deal_risk_index
    );
    failed = true;
  }
} catch (err) {
  console.error("FAIL: Northline DRI formula could not be evaluated", err);
  failed = true;
}
if (!northlinePi.formula.includes("timing_penalty(10)")) {
  console.error("FAIL: Northline formula should print the timing penalty", northlinePi.formula);
  failed = true;
}
const northlinePath = cycleViabilities(northline);
if (northlinePath[2] !== northline.viability_score || !assertFlatRecoverablePath("Northline", northlinePath)) {
  if (northlinePath[2] !== northline.viability_score) {
    console.error("FAIL: Northline final cycle should equal viability", northlinePath, northline.viability_score);
  }
  failed = true;
}
if (statusFromTrajectory(northline.trajectory_type, "STALLED — HIGH RISK") !== "STALLED — RECOVERABLE") {
  console.error("FAIL: Northline status should follow the recoverable trajectory");
  failed = true;
}
const northlineForecast = forecastGuidance({
  status: statusFromTrajectory(northline.trajectory_type, "STALLED — HIGH RISK"),
  trajectory: northline.trajectory_type,
  recoverability: northline.viability_score,
});
if (northlineForecast.removeFromForecast || !northlineForecast.line.includes("keep on forecast")) {
  console.error("FAIL: Northline should stay on the forecast", northlineForecast);
  failed = true;
}

const structuralDeathCase = {
  constraint: 0,
  structural: 95,
  enabler: 90,
  intent: 75,
  blockerClassification: "STRUCTURAL LOCK-INS",
};
const structuralDeath = deriveCanonicalState(
  [
    {
      factor: "Technical veto by an absent stakeholder",
      type: "Structural",
      weight: structuralDeathCase.structural,
      evidence: "He signs off on the network. Nothing is approved without him.",
    },
    {
      factor: "Budget alignment",
      type: "Enabler",
      weight: structuralDeathCase.enabler,
      evidence: "The platform fee was modeled.",
    },
    {
      factor: "Champion support",
      type: "Intent",
      weight: structuralDeathCase.intent,
      evidence: "I like what I saw in the overview.",
    },
    {
      factor: "Later window",
      type: "Timing",
      weight: 5,
      evidence: "After fiscal close.",
    },
  ],
  structuralDeathCase.blockerClassification
);
const structuralDeathFrozen = structuralDeath.frozen;
const structuralDeathForecast = forecastGuidance({
  status: "STALLED — HIGH RISK",
  trajectory: structuralDeathFrozen.trajectory_type,
  recoverability: structuralDeathFrozen.viability_score,
});

console.log("\n=== Structural death ===");
console.log(
  "  viability:",
  structuralDeathFrozen.viability_score,
  "trajectory:",
  structuralDeathFrozen.trajectory_type,
  "blocker:",
  structuralDeath.causal.blocker_classification
);

if (structuralDeathFrozen.viability_score !== 10) {
  console.error("FAIL: Structural death viability should be 10, got", structuralDeathFrozen.viability_score);
  failed = true;
}
if (structuralDeathFrozen.trajectory_type !== "DEFERRED (locked)") {
  console.error(
    "FAIL: Structural death trajectory should be DEFERRED (locked), got",
    structuralDeathFrozen.trajectory_type
  );
  failed = true;
}
if (structuralDeath.causal.blocker_classification !== "STRUCTURAL LOCK-INS") {
  console.error(
    "FAIL: Structural death should stay STRUCTURAL LOCK-INS, got",
    structuralDeath.causal.blocker_classification
  );
  failed = true;
}
if (!structuralDeathForecast.removeFromForecast || structuralDeathForecast.line !== NON_VIABLE_FORECAST_LINE) {
  console.error("FAIL: Structural death forecast line should remove the deal", structuralDeathForecast);
  failed = true;
}
if (statusFromTrajectory(structuralDeathFrozen.trajectory_type, "STALLED — RECOVERABLE") !== "STALLED — HIGH RISK") {
  console.error("FAIL: A locked trajectory should not keep a recoverable headline");
  failed = true;
}
const structuralDeathPi = deriveProprietaryIndices(structuralDeathFrozen, [], "");
if (structuralDeathPi.formula.includes("timing_penalty")) {
  console.error("FAIL: Timing penalty should stay hidden when constraint is not above 40", structuralDeathPi.formula);
  failed = true;
}

const suppressedNorthline = deriveCanonicalState(
  [
    {
      factor: "Technical veto by VP of Infrastructure",
      type: "Structural",
      weight: 90,
      evidence: "He signs off on the network. He missed the technical demo.",
    },
    {
      factor: "VP sign-off still outstanding",
      type: "Constraint",
      weight: 80,
      evidence: "Nothing moves until Dave reviews it.",
    },
    {
      factor: "Budget modeled in range",
      type: "Enabler",
      weight: 85,
      evidence: "The platform fee was modeled.",
    },
    {
      factor: "Month-end unavailability",
      type: "Timing",
      weight: 70,
      evidence: "He is underwater until month-end.",
    },
  ],
  "STRUCTURAL LOCK-INS"
);
const suppressedFrozen = suppressedNorthline.frozen;
const suppressedPath = cycleViabilities(suppressedFrozen);
const suppressedPi = deriveProprietaryIndices(suppressedFrozen, [], "missed the technical demo");
const suppressedForecast = forecastGuidance({
  status: statusFromTrajectory(suppressedFrozen.trajectory_type, "STALLED — HIGH RISK"),
  trajectory: suppressedFrozen.trajectory_type,
  recoverability: suppressedFrozen.viability_score,
});

console.log("\n=== Northline suppressed: high constraint, temporary miss ===");
console.log(
  "  viability:",
  suppressedFrozen.viability_score,
  "path:",
  suppressedPath.join(" → "),
  "blocker:",
  suppressedNorthline.causal.blocker_classification
);

if (suppressedNorthline.causal.blocker_classification !== "TEMPORARY BLOCKERS") {
  console.error(
    "FAIL: Suppressed Northline should be TEMPORARY BLOCKERS, got",
    suppressedNorthline.causal.blocker_classification
  );
  failed = true;
}
if (suppressedFrozen.trajectory_type !== "DEFERRED (recoverable)") {
  console.error(
    "FAIL: Suppressed Northline should stay DEFERRED (recoverable), got",
    suppressedFrozen.trajectory_type
  );
  failed = true;
}
if (suppressedFrozen.viability_score <= 0 || suppressedFrozen.viability_score > 40) {
  console.error(
    "FAIL: Suppressed Northline viability should stay above zero and below 40, got",
    suppressedFrozen.viability_score
  );
  failed = true;
}
if (suppressedPath[2] !== suppressedFrozen.viability_score || !assertFlatRecoverablePath("Suppressed Northline", suppressedPath)) {
  if (suppressedPath[2] !== suppressedFrozen.viability_score) {
    console.error("FAIL: Suppressed Northline final cycle should equal viability", suppressedPath);
  }
  failed = true;
}
if (!suppressedPi.formula.includes("timing_penalty(10)")) {
  console.error("FAIL: Suppressed Northline formula should print the timing penalty", suppressedPi.formula);
  failed = true;
}
try {
  const evaluated = evalDriFormula(suppressedPi.formula);
  if (evaluated !== suppressedPi.deal_risk_index) {
    console.error(
      "FAIL: Suppressed Northline DRI formula evaluated to",
      evaluated,
      "but index is",
      suppressedPi.deal_risk_index
    );
    failed = true;
  }
} catch (err) {
  console.error("FAIL: Suppressed Northline DRI formula could not be evaluated", err);
  failed = true;
}
if (statusFromTrajectory(suppressedFrozen.trajectory_type, "STALLED — HIGH RISK") !== "STALLED — RECOVERABLE") {
  console.error("FAIL: Suppressed Northline status should follow the recoverable trajectory");
  failed = true;
}
if (suppressedForecast.removeFromForecast) {
  console.error("FAIL: Suppressed Northline should stay on the forecast", suppressedForecast);
  failed = true;
}

const calendarMiss = deriveCanonicalState(
  [
    {
      factor: "Technical veto by VP of Infrastructure",
      type: "Structural",
      weight: 95,
      evidence: "He's the one who signs off. Without him, the deal waits.",
    },
    {
      factor: "Budget alignment",
      type: "Enabler",
      weight: 90,
      evidence: "The platform fee was modeled.",
    },
    {
      factor: "Champion support",
      type: "Intent",
      weight: 75,
      evidence: "I like what I saw in the overview.",
    },
    {
      factor: "VP unavailability",
      type: "Timing",
      weight: 70,
      evidence: "He missed the technical demo and is underwater until month-end.",
    },
  ],
  "STRUCTURAL LOCK-INS"
);
const calendarForecast = forecastGuidance({
  status: "STALLED — RECOVERABLE",
  trajectory: calendarMiss.frozen.trajectory_type,
  recoverability: calendarMiss.frozen.viability_score,
});

console.log("\n=== Calendar miss filed as structural ===");
console.log(
  "  viability:",
  calendarMiss.frozen.viability_score,
  "trajectory:",
  calendarMiss.frozen.trajectory_type,
  "blocker:",
  calendarMiss.causal.blocker_classification
);

if (calendarMiss.causal.blocker_classification !== "TEMPORARY BLOCKERS") {
  console.error(
    "FAIL: A missed demo should be TEMPORARY BLOCKERS, got",
    calendarMiss.causal.blocker_classification
  );
  failed = true;
}
if (calendarMiss.frozen.viability_score < 30 || calendarMiss.frozen.viability_score > 65) {
  console.error(
    "FAIL: Calendar-miss viability should be 30-65, got",
    calendarMiss.frozen.viability_score
  );
  failed = true;
}
if (calendarMiss.frozen.trajectory_type !== "DEFERRED (recoverable)") {
  console.error(
    "FAIL: Calendar-miss trajectory should be DEFERRED (recoverable), got",
    calendarMiss.frozen.trajectory_type
  );
  failed = true;
}
if (calendarForecast.removeFromForecast) {
  console.error("FAIL: A recoverable calendar miss should stay on the forecast");
  failed = true;
}

const mergedQuotes = mergeOverlappingQuotes([
  "Sarah, I like what I saw in the overview.",
  "Sarah, I like what I saw in the overview. But I need to be straight with you — Dave missed the technical demo yesterday.",
]);
if (mergedQuotes.length !== 1 || !mergedQuotes[0].includes("Dave missed")) {
  console.error("FAIL: Overlapping evidence quotes should merge", mergedQuotes);
  failed = true;
}

const northlineBaseline = commercialBaselineFromText(sarahMarkTranscript);
if (northlineBaseline.fee !== "$280,000 Annual Platform Fee") {
  console.error("FAIL: Northline fee line should name the annual platform fee", northlineBaseline.fee);
  failed = true;
}
if (northlineBaseline.owner !== "Sarah Chen") {
  console.error("FAIL: Northline owner should be Sarah Chen", northlineBaseline.owner);
  failed = true;
}
if (northlineBaseline.target !== "Post Month-End Access") {
  console.error("FAIL: Northline target should be post month-end", northlineBaseline.target);
  failed = true;
}

const riskInputs = [];
for (const viability_score of [0, 21, 52, 100]) {
  for (const constraint_pressure of [0, 40, 41, 80, 90]) {
    for (const structural_lock_in of [0, 79, 95]) {
      for (const enabler_strength of [0, 39, 60, 85]) {
        for (const timing_factor of [0, 5, 6, 20]) {
          for (const trajectory_type of ["DEFERRED (recoverable)", "DEFERRED (locked)", "VALIDATED / VELOCITY"]) {
            for (const dispersion of [0, 23, 34]) {
              for (const stall of [0, 40, 89]) {
                riskInputs.push({
                  viability_score,
                  constraint_pressure,
                  structural_lock_in,
                  enabler_strength,
                  timing_factor,
                  trajectory_type,
                  dispersion,
                  stall,
                });
              }
            }
          }
        }
      }
    }
  }
}

for (const input of riskInputs) {
  const frozen = {
    viability_score: input.viability_score,
    constraint_pressure: input.constraint_pressure,
    structural_lock_in: input.structural_lock_in,
    enabler_strength: input.enabler_strength,
    timing_factor: input.timing_factor,
    trajectory_type: input.trajectory_type,
  };
  const report = compileDealRiskReport(frozen, input.dispersion, input.stall);
  const repeat = compileDealRiskReport(frozen, input.dispersion, input.stall);
  const penaltyApplies = input.timing_factor <= 5 && input.constraint_pressure > 40;
  const shape = new RegExp(
    `^DRI ${report.deal_risk_index} = 0\\.30×\\(100−${input.viability_score}\\) \\+ 0\\.25×${input.constraint_pressure} \\+ 0\\.15×${input.structural_lock_in} \\+ 0\\.20×${input.dispersion} \\+ 0\\.10×\\d+${penaltyApplies ? " \\+ timing_penalty\\(10\\)" : ""} − 0\\.15×${input.enabler_strength}$`
  );
  let evaluated;
  try {
    evaluated = evalDriFormula(report.formula);
  } catch (err) {
    console.error("FAIL: Reporting formula could not be evaluated", input, err);
    failed = true;
    break;
  }
  if (
    evaluated !== report.deal_risk_index ||
    report.formula !== repeat.formula ||
    report.deal_risk_index !== repeat.deal_risk_index ||
    !shape.test(report.formula) ||
    penaltyApplies !== report.formula.includes("timing_penalty(10)")
  ) {
    console.error("FAIL: Reporting formula drifted from the index", input, report, evaluated);
    failed = true;
    break;
  }
}

if (failed) process.exit(1);
console.log("\nSCORING + DRI REGRESSION OK");
console.log("  replay viability:", alexA.viability_score, alexA.trajectory_type);
