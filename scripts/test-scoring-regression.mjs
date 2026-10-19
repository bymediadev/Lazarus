import {
  deriveCanonicalState,
  deriveProprietaryIndices,
  compileDealRiskReport,
  computeDialogueStallSignals,
  computeStakeholderDispersion,
  isNotAPurchase,
  isSellerIntroduction,
  lockForcesToTranscript,
  reconcilePersona,
} from "../server/scoring.ts";
import { statusFromTrajectory, assertAnalysisSchema } from "../server/gemini.ts";
import { alignBlockerNarrative } from "../src/lib/blockerNarrative.ts";
import { commercialBaselineFromText, presentCommercialBaseline } from "../src/lib/commercialBaseline.ts";
import { DEFER_FORECAST_LINE, forecastGuidance, NON_VIABLE_FORECAST_LINE, NOT_A_PURCHASE_FORECAST_LINE } from "../src/lib/forecastCall.ts";
import { canonicalImmediateActions, classifyRecoverability, classifyRisk, diagnosticProfile, matrixFacing, parseTurns, promisedRelationshipSteps, publishesStallMetrics, purchaseMotion, recommendedMoveLine, reportCategory, stalledHeadline, validateReportMatrix } from "../src/lib/reportMatrix.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";
import { mergeOverlappingQuotes } from "../src/lib/evidenceQuotes.ts";
import { lifecycleDelta, lifecyclePhaseFromStatus, presentLifecycleRun, presentThreadImprovement, publishesLifecycleScores, scoreMovement } from "../server/meDeals.ts";
import { storedReportColumns } from "../server/reportSanitize.ts";
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
if (sPi.dialogue_stall_score <= 0 || sPi.deal_risk_index <= 0) {
  console.error("FAIL: Sarah/Mark still uses deal risk and stall", sPi);
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
  dispersion: 0,
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
const northlineStatus = statusFromTrajectory(
  northline.trajectory_type,
  "STALLED — HIGH RISK",
  northlinePi.risk_tier
);
if (!northlineStatus.includes(`${northlinePi.risk_tier} RISK`)) {
  console.error("FAIL: Northline headline should use the risk tier", northlineStatus, northlinePi.risk_tier);
  failed = true;
}
const northlineForecast = forecastGuidance({
  status: northlineStatus,
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
if (structuralDeathFrozen.viability_state !== "DEFERRED VIABILITY") {
  console.error(
    "FAIL: A low score with a structural-lock label should stay deferred, got",
    structuralDeathFrozen.viability_state
  );
  failed = true;
}
if (!structuralDeathForecast.removeFromForecast || structuralDeathForecast.line !== DEFER_FORECAST_LINE) {
  console.error("FAIL: Structural pressure should defer the quarter without declaring the deal impossible", structuralDeathForecast);
  failed = true;
}
if (structuralDeathForecast.line === NON_VIABLE_FORECAST_LINE) {
  console.error("FAIL: Viability 10 must not use the non-viable forecast line");
  failed = true;
}
const structuralDeathPi = deriveProprietaryIndices(structuralDeathFrozen, [], "");
const structuralDeathStatus = statusFromTrajectory(
  structuralDeathFrozen.trajectory_type,
  "STALLED — RECOVERABLE",
  structuralDeathPi.risk_tier
);
if (!structuralDeathStatus.includes(`${structuralDeathPi.risk_tier} RISK`) || structuralDeathStatus.includes("RECOVERABLE")) {
  console.error("FAIL: A locked deal headline should follow the risk tier", structuralDeathStatus, structuralDeathPi.risk_tier);
  failed = true;
}
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
const suppressedStatus = statusFromTrajectory(
  suppressedFrozen.trajectory_type,
  "STALLED — HIGH RISK",
  suppressedPi.risk_tier
);
if (!suppressedStatus.includes(`${suppressedPi.risk_tier} RISK`)) {
  console.error("FAIL: Suppressed Northline headline should use the risk tier", suppressedStatus, suppressedPi.risk_tier);
  failed = true;
}
if (suppressedForecast.removeFromForecast) {
  console.error("FAIL: Suppressed Northline should stay on the forecast", suppressedForecast);
  failed = true;
}
if (suppressedFrozen.equilibrium_state !== "PINNED") {
  console.error("FAIL: A 170 force sum should read PINNED, got", suppressedFrozen.equilibrium_state);
  failed = true;
}
if (northline.equilibrium_state !== "OPEN") {
  console.error("FAIL: A light force sum should read OPEN, got", northline.equilibrium_state);
  failed = true;
}
const alignedNarrative = alignBlockerNarrative(
  "Dave holds veto power. The primary blocker is structural due to unaddressed technical validation requirements.",
  "TEMPORARY BLOCKERS"
);
if (
  /\bstructural\b/i.test(alignedNarrative) ||
  !alignedNarrative.toLowerCase().includes("primary blocker is temporary")
) {
  console.error("FAIL: Temporary blocker narrative should not stay structural", alignedNarrative);
  failed = true;
}
const structuralNarrative = alignBlockerNarrative(
  "The primary blocker is structural.",
  "STRUCTURAL LOCK-INS"
);
if (structuralNarrative !== "The primary blocker is structural.") {
  console.error("FAIL: A real structural lock should keep its narrative", structuralNarrative);
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

function feeMentions(baseline, pattern) {
  return pattern.test(baseline.fee ?? "") || (baseline.context ?? []).some((item) => pattern.test(item.label));
}
const moneyCases = [
  ["fixtures/daniel_referral_transcript.txt", /1,000,000|500,000/, "seller_revenue"],
  ["fixtures/transcript_3_federal_audit.txt", /240,000|200,000/, "rejected"],
  ["fixtures/cybercore_messy_paste.txt", /1,200,000|45,000|150,000/, "rejected"],
  ["fixtures/transcript_1_velocity_deal.txt", null, null],
];
for (const [file, rejectedPattern, kind] of moneyCases) {
  const baseline = commercialBaselineFromText(readFileSync(file, "utf-8"));
  if (file.endsWith("transcript_1_velocity_deal.txt")) {
    if (!baseline.fee?.includes("320,000")) {
      console.error("FAIL: A supported buyer budget stays on the commercial baseline", baseline);
      failed = true;
    }
    continue;
  }
  if (baseline.fee && rejectedPattern.test(baseline.fee)) {
    console.error("FAIL: An unqualified amount is on the commercial baseline", file, baseline.fee);
    failed = true;
  }
  if (!feeMentions(baseline, rejectedPattern) || !(baseline.context ?? []).some((item) => item.kind === kind && rejectedPattern.test(item.label))) {
    console.error("FAIL: The unqualified amount should stay visible as context", file, baseline);
    failed = true;
  }
}
const bareBaseline = commercialBaselineFromText(
  "PROSPECT: We have a budget of $40,000. I am not going to be your client.\nSELLER: Understood."
);
if (bareBaseline.fee?.includes("40,000") || !(bareBaseline.context ?? []).some((item) => item.label.includes("40,000"))) {
  console.error("FAIL: A refused dollar stays off the qualified baseline", bareBaseline);
  failed = true;
}
const gongBaseline = commercialBaselineFromText("Me: Our customers do about $2 million.\nThem: I am not going to be your client.");
if (gongBaseline.fee?.includes("2,000,000") || !(gongBaseline.context ?? []).some((item) => item.kind === "seller_revenue" && item.label.includes("2,000,000"))) {
  console.error("FAIL: Speaker-ambiguous revenue stays off the qualified baseline", gongBaseline);
  failed = true;
}
const nameBaseline = commercialBaselineFromText(
  "Jordan: The downtime is costing you $45,000 per day.\nCasey: Pull the plug. We signed with the other vendor yesterday."
);
if (nameBaseline.fee?.includes("45,000")) {
  console.error("FAIL: An unassigned cost figure stays off the qualified baseline", nameBaseline);
  failed = true;
}
const storedLie = presentCommercialBaseline({
  stored: { fee: "$1,000,000 Annual Platform Fee", owner: null, target: null },
  diagnosticBudget: "Consultation budget was not qualified. Budget was mentioned, but not as this person's ability or willingness to pay for the consultation.",
});
if (storedLie.fee !== null) {
  console.error("FAIL: A saved fee cannot outvote a budget line that rejected it", storedLie);
  failed = true;
}
const storedKept = presentCommercialBaseline({
  stored: { fee: "$1,000,000 Annual Platform Fee", owner: "Sarah Chen", target: "Post Month-End Access" },
  diagnosticBudget: 'Budget was qualified for this purchase. Evidence: "Budget-wise, $280K is what we modeled"',
});
if (!storedKept.fee?.includes("280,000") || storedKept.fee.includes("1,000,000") || storedKept.owner !== "Sarah Chen") {
  console.error("FAIL: A saved run keeps the qualified buyer amount and drops the other figure", storedKept);
  failed = true;
}
const storedNorthline = presentCommercialBaseline({
  stored: { fee: "$280,000 Annual Platform Fee", owner: "Sarah Chen", target: "Post Month-End Access" },
});
if (storedNorthline.fee !== "$280,000 Annual Platform Fee") {
  console.error("FAIL: A saved stalled deal with no budget rejection keeps its purchase value", storedNorthline);
  failed = true;
}
const reopenedContext = presentCommercialBaseline({
  stored: {
    fee: "$1,000,000 Annual Platform Fee",
    owner: null,
    target: null,
    context: [{ kind: "seller_revenue", label: "$1,000,000", note: "Not the purchase value." }],
  },
  diagnosticBudget: "Consultation budget was not qualified. Budget was mentioned, but not as this person's ability or willingness to pay for the consultation.",
});
if (
  reopenedContext.fee !== null ||
  !reopenedContext.context?.some((item) => item.kind === "seller_revenue" && item.label === "$1,000,000")
) {
  console.error("FAIL: A saved classification stays on the brief after the transcript is gone", reopenedContext);
  failed = true;
}
const noInvention = presentCommercialBaseline({
  stored: { fee: "$1,000,000 Annual Platform Fee", owner: null, target: null },
  diagnosticBudget: "Consultation budget was not qualified.",
});
if (noInvention.fee !== null || (noInvention.context ?? []).length !== 0) {
  console.error("FAIL: A rejected stored fee does not become a made-up context line", noInvention);
  failed = true;
}
const sideAmount = commercialBaselineFromText(
  "SELLER: Is the purchase still open?\nBUYER: We spend $2,000,000 on ads. Dave still has to approve the platform."
);
if (sideAmount.fee != null || !sideAmount.context?.some((item) => item.label === "$2,000,000")) {
  console.error("FAIL: A buyer dollar that is not this purchase stays off the baseline", sideAmount);
  failed = true;
}
const besideFee = commercialBaselineFromText(
  "SC: Last week you mentioned the $280,000 annual platform fee was in range.\nMO: The renovation was $90,000. Budget-wise, $280K is what we modeled."
);
if (!besideFee.fee?.includes("280,000") || besideFee.fee.includes("90,000") || !besideFee.context?.some((item) => item.label === "$90,000")) {
  console.error("FAIL: A side amount does not replace the purchase value", besideFee);
  failed = true;
}
const savedMoney = storedReportColumns({
  dealStatus: "NOT A PURCHASE",
  analysisJson: {
    commercial_baseline: {
      fee: null,
      owner: null,
      target: null,
      context: [{ kind: "seller_revenue", label: "$1,000,000", note: "Not the purchase value." }],
    },
    source_transcript: "SELLER: They're probably doing about $1 million in revenue annually.",
    evidence: "a quote that must not be stored",
  },
});
const savedContext = savedMoney.analysis_json?.commercial_baseline?.context ?? [];
if (
  savedMoney.transcript_text !== null ||
  savedMoney.analysis_json?.source_transcript != null ||
  savedMoney.analysis_json?.evidence != null ||
  savedContext[0]?.kind !== "seller_revenue" ||
  savedContext[0]?.label !== "$1,000,000"
) {
  console.error("FAIL: The money classification is kept and the transcript is not", savedMoney);
  failed = true;
}
const scoreOnly = lifecycleDelta({
  olderPhase: "stalled_high_risk",
  newerPhase: "stalled_recoverable",
  olderViability: 0,
  newerViability: 53,
  olderRisk: 67,
  newerRisk: 64,
});
if (scoreOnly.direction !== "flat" || scoreOnly.summary !== "viability +53 · risk -3 · stage unchanged") {
  console.error("FAIL: A viability change does not move the stage", scoreOnly);
  failed = true;
}
const stageMoved = lifecycleDelta({
  olderPhase: "stalled_recoverable",
  newerPhase: "closed_won",
  olderViability: 53,
  newerViability: 53,
  olderRisk: 64,
  newerRisk: 64,
});
if (stageMoved.direction !== "improved" || !/stage advanced/.test(stageMoved.summary)) {
  console.error("FAIL: A real stage change is still reported", stageMoved);
  failed = true;
}

const danielText = readFileSync("fixtures/daniel_referral_transcript.txt", "utf-8");
const danielFacing = matrixFacing({ status: "NOT A PURCHASE", transcript: danielText });
const danielBaseline = commercialBaselineFromText(danielText);
const danielBudget = diagnosticProfile(danielText).budget;
if (
  danielFacing.trajectoryLabel !== "Not a deal" ||
  danielFacing.showScorecard ||
  danielFacing.offForecast !== true ||
  danielBaseline.fee != null ||
  /1,000,000|500,000/.test(danielBaseline.fee ?? "") ||
  !danielBaseline.context?.some((item) => item.kind === "seller_revenue" && /1,000,000|500,000/.test(item.label)) ||
  !danielBudget.startsWith("Consultation budget was not qualified")
) {
  console.error("FAIL: The referral read stays off the forecast and keeps seller revenue out of the fee", danielFacing, danielBaseline, danielBudget);
  failed = true;
}
const referralUnclassified = presentCommercialBaseline({
  stored: { fee: "$1,000,000 Annual Platform Fee", owner: null, target: null },
  diagnosticBudget: "Consultation budget was not qualified.",
});
const referralClassified = presentCommercialBaseline({
  stored: {
    fee: null,
    owner: null,
    target: null,
    context: [{ kind: "seller_revenue", label: "$1,000,000", note: "Not the purchase value." }],
  },
  diagnosticBudget: "Consultation budget was not qualified.",
});
if (referralUnclassified.fee !== null || (referralUnclassified.context ?? []).length !== 0) {
  console.error("FAIL: A referral row with no stored classification stays unclassified", referralUnclassified);
  failed = true;
}
if (
  referralClassified.fee !== null ||
  !referralClassified.context?.some((item) => item.kind === "seller_revenue" && item.label === "$1,000,000")
) {
  console.error("FAIL: Known seller revenue stays labeled and off the purchase value", referralClassified);
  failed = true;
}
const olderReferralRun = {
  lifecycle_phase: "stalled_recoverable",
  viability_score: 41,
  deal_risk_index: 70,
  trajectory_type: "DEFERRED (recoverable)",
};
const currentReferralRun = {
  lifecycle_phase: "not_a_purchase",
  viability_score: 12,
  deal_risk_index: 80,
  trajectory_type: "NON-VIABLE / DEAD",
};
const shownOlderReferral = presentLifecycleRun(olderReferralRun, null);
const shownCurrentReferral = presentLifecycleRun(currentReferralRun, olderReferralRun);
if (
  presentThreadImprovement([olderReferralRun, currentReferralRun]) !== null ||
  shownOlderReferral.viability_score !== 41 ||
  shownOlderReferral.deal_risk_index !== 70 ||
  shownCurrentReferral.viability_score !== null ||
  shownCurrentReferral.deal_risk_index !== null ||
  shownCurrentReferral.since_previous !== null ||
  olderReferralRun.viability_score !== 41
) {
  console.error("FAIL: An older referral snapshot keeps its scores and the current off-forecast run adds no thread delta", shownOlderReferral, shownCurrentReferral);
  failed = true;
}
if (
  storedNorthline.fee !== "$280,000 Annual Platform Fee" ||
  storedNorthline.owner !== "Sarah Chen" ||
  storedNorthline.target !== "Post Month-End Access" ||
  lifecyclePhaseFromStatus("STALLED — RECOVERABLE") !== "stalled_recoverable"
) {
  console.error("FAIL: The Northline saved run keeps the purchase and the stalled phase", storedNorthline);
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

const northstarWithoutIntent = deriveCanonicalState(
  [
    {
      factor: "Company-wide discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
    {
      factor: "Need to improve workflows",
      type: "Enabler",
      weight: 60,
      evidence: "We're still looking at ways to improve the workflows across our facilities.",
    },
  ],
  "STRUCTURAL LOCK-INS",
  "**Sarah:** I don't think we should close the door.\n**Sarah:** The project hasn't disappeared."
);
if (northstarWithoutIntent.frozen.intent_strength !== 70) {
  console.error(
    "FAIL: Stated willingness should stay intent when the model omits it, got",
    northstarWithoutIntent.frozen.intent_strength
  );
  failed = true;
}
if (northstarWithoutIntent.frozen.viability_state !== "DEFERRED VIABILITY") {
  console.error(
    "FAIL: Restored willingness should stay deferred, got",
    northstarWithoutIntent.frozen.viability_state
  );
  failed = true;
}

const northstarLive = deriveCanonicalState(
  [
    {
      factor: "Company-wide discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence:
        "The company is freezing discretionary spending until the end of the quarter. Additional approval, technically.",
    },
    {
      factor: "Sarah still wants the operational problem solved",
      type: "Intent",
      weight: 85,
      evidence: "I don't think we should close the door. I also don't think we're ready to buy right now.",
    },
  ],
  "STRUCTURAL LOCK-INS",
  "The company is freezing discretionary spending. Additional approval, technically. But anything that isn't essential is being pushed out."
);
const northstarForecast = forecastGuidance({
  status: statusFromTrajectory(northstarLive.frozen.trajectory_type, "STALLED — HIGH RISK"),
  trajectory: northstarLive.frozen.trajectory_type,
  recoverability: northstarLive.frozen.viability_score,
  viabilityState: northstarLive.frozen.viability_state,
});
console.log("\n=== Northstar live weights ===");
console.log(
  "  viability:",
  northstarLive.frozen.viability_score,
  "state:",
  northstarLive.frozen.viability_state,
  "trajectory:",
  northstarLive.frozen.trajectory_type
);
if (northstarLive.frozen.viability_score !== 0) {
  console.error("FAIL: Northstar viability should stay 0 for these weights, got", northstarLive.frozen.viability_score);
  failed = true;
}
if (northstarLive.frozen.viability_state !== "DEFERRED VIABILITY") {
  console.error("FAIL: Northstar should be deferred, got", northstarLive.frozen.viability_state);
  failed = true;
}
if (!northstarForecast.removeFromForecast || northstarForecast.line !== DEFER_FORECAST_LINE || !northstarForecast.showRecoveryPlan) {
  console.error("FAIL: Northstar should leave this quarter's forecast and keep a recovery plan", northstarForecast);
  failed = true;
}

const northstarRecovered = deriveCanonicalState(
  [
    {
      factor: "CFO will approve if validated savings meet the threshold",
      type: "Enabler",
      weight: 80,
      evidence: "David confirms that he will approve the purchase if independently validated savings meet an agreed threshold.",
    },
    {
      factor: "Implementation can begin next quarter",
      type: "Constraint",
      weight: 40,
      evidence: "Priya confirms that implementation can begin next quarter.",
    },
    {
      factor: "Sarah will bring it back to the group",
      type: "Intent",
      weight: 70,
      evidence: "I'd be comfortable bringing it back to the group.",
    },
  ],
  "MIXED"
);
if (northstarRecovered.frozen.viability_score <= northstarLive.frozen.viability_score) {
  console.error(
    "FAIL: Confirmed CFO approval and a next-quarter start should raise viability",
    northstarRecovered.frozen.viability_score
  );
  failed = true;
}
if (northstarRecovered.frozen.viability_state === "NON-VIABLE (STRUCTURALLY LOCKED)") {
  console.error("FAIL: Recovered Northstar should not be structurally locked");
  failed = true;
}

const david = reconcilePersona({
  name: "David",
  persona_type: "Hidden Detractor",
  evidence: "He wants a proper financial case. He's not against the project.",
});
const priya = reconcilePersona({
  name: "Priya",
  persona_type: "Hidden Detractor",
  evidence: "She can't commit her team to another integration project.",
});
const hamilton = reconcilePersona({
  name: "Hamilton facility manager",
  persona_type: "Hidden Detractor",
  evidence: "The Hamilton manager likes FlowTrack. He says the interface is easier to use.",
});
const evan = reconcilePersona({
  name: "Evan",
  persona_type: "Aligned Champion",
  evidence: "I wouldn't tell you that he's pushing it forward right now.",
});
if (david.label !== "Unmet condition" || david.key === "hidden detractor") {
  console.error("FAIL: A financial-case condition is not opposition", david);
  failed = true;
}
if (priya.label !== "Resource constraint") {
  console.error("FAIL: Unavailable capacity is not opposition", priya);
  failed = true;
}
if (hamilton.label !== "Competitive preference") {
  console.error("FAIL: A local pilot preference is not opposition", hamilton);
  failed = true;
}
if (evan.label !== "Inactive sponsor") {
  console.error("FAIL: An inactive sponsor is not an aligned champion", evan);
  failed = true;
}

const northstarTranscript = [
  "Sarah Chen — Director of Operations",
  "Our Hamilton facility has started doing something different. They're piloting another platform.",
  "The Hamilton manager likes it. He says the interface is easier to use than your platform.",
  "We need to understand what Hamilton is actually getting from FlowTrack.",
  "Evan and I haven't had a proper conversation about the project in about six weeks.",
  "David wants a proper financial case. He's not against the project.",
  "Priya told me she can't commit her team to another integration project this quarter.",
].join(" ");
const hamiltonFromCall = reconcilePersona(
  { name: "Hamilton Facility Manager", persona_type: "Aligned Champion", evidence: "" },
  northstarTranscript
);
const evanFromCall = reconcilePersona(
  { name: "Evan", persona_type: "Absent Decision Maker", evidence: "" },
  northstarTranscript
);
const sarahFromCall = reconcilePersona(
  { name: "Sarah Chen", persona_type: "Suppressed Champion", evidence: "" },
  northstarTranscript
);
const davidFromCall = reconcilePersona(
  { name: "David", persona_type: "Unmet condition", evidence: "" },
  northstarTranscript
);
if (hamiltonFromCall.label !== "Competitive preference") {
  console.error("FAIL: A competing-pilot user is not an aligned champion", hamiltonFromCall);
  failed = true;
}
if (evanFromCall.label !== "Inactive sponsor") {
  console.error("FAIL: An inactive COO is not an absent decision maker", evanFromCall);
  failed = true;
}
const priyaFromCall = reconcilePersona(
  {
    name: "Priya",
    persona_type: "Unknown",
    evidence: "Priya thinks it could take twelve to sixteen weeks because of integration and security reviews.",
  },
  "Is Priya willing to do that review? She's willing, but she can't commit her team to another integration project this quarter."
);
if (priyaFromCall.label !== "Resource constraint") {
  console.error("FAIL: A capacity limit stated after Priya's name is a resource constraint", priyaFromCall);
  failed = true;
}
if (sarahFromCall.label !== "Suppressed Champion" || davidFromCall.label !== "Unmet condition") {
  console.error("FAIL: Sarah and David should keep their labels", sarahFromCall, davidFromCall);
  failed = true;
}

const soleOwner = reconcilePersona({
  name: "[REDACTED NAME]",
  role: "Small-business owner / Solopreneur",
  persona_type: "Suppressed Champion",
  evidence: "I'm scanning now because I started my finance and the residential piece.",
});
if (soleOwner.label !== "Economic owner" || soleOwner.key === "suppressed champion") {
  console.error("FAIL: A solopreneur has authority and is not a suppressed champion", soleOwner);
  failed = true;
}

const channelCall = [
  "PROSPECT: if you think that I'm going to be your client, no way. I might be the referral to all of you.",
  "PROSPECT: What I'll do is, I'm going to send you that invitation. To that group.",
  "SELLER: His name is [REFERRAL PARTNER]. I'll put you into a warm connection with him. I'm not here to like close you. You can be a great channel partner.",
].join("\n");
if (!isNotAPurchase(channelCall)) {
  console.error("FAIL: A declined client role plus a channel close is not a purchase");
  failed = true;
}
if (isNotAPurchase("Sarah: I'll stay in touch with our channel partner after David approves.")) {
  console.error("FAIL: A real approval path is still a purchase");
  failed = true;
}
if (!isNotAPurchase("PROSPECT: I am not going to be your client.")) {
  console.error("FAIL: A buyer who refuses the client role is not a deal before any score");
  failed = true;
}
if (isNotAPurchase("SELLER: I'm not here to close you. We'll stay in touch.")) {
  console.error("FAIL: Seller politeness alone does not decide the transcript");
  failed = true;
}
const sarahMotion = purchaseMotion(sarahMarkTranscript);
if (sarahMotion.motion !== "deal_open" || isNotAPurchase(sarahMarkTranscript)) {
  console.error("FAIL: A stalled purchase stays a deal when the transcript is read first", sarahMotion);
  failed = true;
}
if (
  reportCategory({
    status: "NOT A PURCHASE",
    trajectory: "DEFERRED (recoverable)",
    transcript: sarahMarkTranscript,
  }) !== "deal_stalled"
) {
  console.error("FAIL: An open purchase in the transcript overrides a not-a-purchase label");
  failed = true;
}
if (
  reportCategory({
    status: "STALLED — HIGH RISK",
    trajectory: "DEFERRED (recoverable)",
    transcript: channelCall,
  }) !== "not_a_deal"
) {
  console.error("FAIL: A refused client role overrides a stalled label");
  failed = true;
}
const referral = {
  name: "[REFERRAL PARTNER]",
  role: "Credit Repair Specialist",
  persona_type: "Neutral",
  evidence: "His name is [REFERRAL PARTNER].",
};
if (!isSellerIntroduction(referral, channelCall)) {
  console.error("FAIL: The seller's credit-repair introduction is not a buyer");
  failed = true;
}
if (isSellerIntroduction({ name: "Sarah Chen", role: "Director of Operations", persona_type: "Suppressed Champion", evidence: "" }, northstarTranscript)) {
  console.error("FAIL: A named champion is not a seller introduction");
  failed = true;
}

const channelDispersion = computeStakeholderDispersion([
  {
    name: "[REDACTED NAME]",
    role: "Small-business owner / Solopreneur",
    persona_type: "Suppressed Champion",
    evidence: "I started my finance and the residential piece.",
  },
  referral,
]);
if (channelDispersion.authority_gap || channelDispersion.index !== 0 || channelDispersion.multi_department_friction !== 0) {
  console.error("FAIL: Owner plus a referral intro should not create an authority gap or department friction", channelDispersion);
  failed = true;
}
const financeGate = computeStakeholderDispersion([
  {
    name: "Dana",
    role: "Director of Operations",
    persona_type: "Aligned Champion",
    evidence: "Finance has to approve the budget before we can sign.",
  },
]);
if (!financeGate.department_mentions.includes("finance")) {
  console.error("FAIL: A finance approval is still department friction", financeGate);
  failed = true;
}

const channelForecast = forecastGuidance({
  status: "NOT A PURCHASE",
  trajectory: "DEFERRED (recoverable)",
  recoverability: 41,
});
if (!channelForecast.removeFromForecast || channelForecast.line !== NOT_A_PURCHASE_FORECAST_LINE) {
  console.error("FAIL: A non-purchase stays off the forecast", channelForecast);
  failed = true;
}
const channelRecovery = classifyRecoverability({
  viability: 41,
  trajectory: "DEFERRED (recoverable)",
  blocker: "MIXED",
  intent: 40,
  forces: [],
  evidence: channelCall,
});
if (channelRecovery.status !== "FLAT_NO") {
  console.error("FAIL: A declined client role is a flat no in the report matrix", channelRecovery);
  failed = true;
}
const channelFacing = matrixFacing({
  status: "NOT A PURCHASE",
  trajectory: "DEFERRED (recoverable)",
  recoverabilityStatus: "FLAT_NO",
});
if (
  channelFacing.category !== "not_a_deal" ||
  channelFacing.showScorecard ||
  channelFacing.trajectoryLabel !== "Not a deal" ||
  channelFacing.recoverabilityLabel !== "Not a deal"
) {
  console.error("FAIL: The report should say Not a deal and hide the scorecard", channelFacing);
  failed = true;
}
const channelSteps = promisedRelationshipSteps(channelCall, "[REDACTED NAME]");
if (
  channelSteps.length !== 2 ||
  !channelSteps.some((step) => /invitation/i.test(step)) ||
  !channelSteps.some((step) => /introduction already promised/i.test(step)) ||
  channelSteps.some((step) => /framework link|partnership/i.test(step))
) {
  console.error("FAIL: A referral call keeps the promised steps, including the networking invite", channelSteps);
  failed = true;
}
const channelNotes = formatCompressedCrmNotes({
  client_name: "Referral call",
  deal_status: "NOT A PURCHASE",
  deal_classification: { status: "NOT A PURCHASE", confidence_level: 70, recoverability_score: 0 },
  executive_summary: "This conversation never opened a purchase.",
  proprietary_indices: {
    deal_risk_index: 79,
    risk_tier: "CRITICAL",
    multi_department_friction: 0,
    stakeholder_dispersion_index: 0,
    dialogue_stall_score: 43,
    authority_gap_flag: false,
    explanations: {},
  },
  viability_state: { state: "DEFERRED VIABILITY", viability_score: 0, equilibrium_derivation: "", derivation_components: { intent_strength: 0, constraint_pressure: 0, structural_lock_in_impact: 0, timing_accessibility: 0 } },
  recoverability: { status: "FLAT_NO", explanation: "Not a purchase." },
  equilibrium_analysis: { state: "OPEN", dominating_forces: [], equilibrium_breaker: "", explanation: "Why it's stuck should stay off this paste." },
  crm_intelligence: { recommended_next_action: "Explore a channel partnership." },
  immediate_remediation: channelSteps,
  rescue_triage_plan: { immediate_0_30_days: [], near_term_30_90_days: ["Hold the weekly recovery motion from this week’s actions."], long_term_90_plus_days: [] },
  diagnostic_profile: diagnosticProfile(channelCall),
  stakeholders: [],
});
const channelMove = channelNotes.split("**Recommended next move:**")[1]?.split("\n")[0] ?? "";
const tightMove = recommendedMoveLine(channelSteps);
if (
  !channelNotes.includes("Not a deal") ||
  !channelNotes.includes("invitation") ||
  channelMove.trim() !== tightMove ||
  /Activity|Current status|partnership|This is not a deal/i.test(channelMove) ||
  /CRITICAL|Stall signals|weekly recovery|partnership|Why it's stuck|buying group|NOT A PURCHASE/i.test(channelNotes)
) {
  console.error("FAIL: A referral overview stays out of stalled-deal metrics", channelMove, channelNotes);
  failed = true;
}
const wordCategory = reportCategory({
  status: "STALLED — HIGH RISK",
  trajectory: "DEFERRED (recoverable)",
  relevanceLabel: "not_sales",
});
const wordNotes = formatCompressedCrmNotes({
  client_name: "Recipe",
  deal_status: "STALLED — HIGH RISK",
  relevance: { label: "not_sales", reason: "This is a Word document, not a purchase." },
  proprietary_indices: {
    deal_risk_index: 79,
    risk_tier: "CRITICAL",
    multi_department_friction: 28,
    stakeholder_dispersion_index: 12,
    dialogue_stall_score: 43,
    authority_gap_flag: true,
    explanations: {},
  },
  viability_state: { state: "DEFERRED VIABILITY", viability_score: 0, equilibrium_derivation: "", derivation_components: { intent_strength: 0, constraint_pressure: 0, structural_lock_in_impact: 0, timing_accessibility: 0 } },
  immediate_remediation: [],
  stakeholders: [],
});
const wordMove = wordNotes.split("**Recommended next move:**")[1]?.split("\n")[0] ?? "";
if (
  wordCategory !== "not_a_deal" ||
  /CRITICAL|Stall signals|Deal Risk Score/i.test(wordNotes) ||
  !wordNotes.includes("Not a deal") ||
  wordMove.trim() !== "No purchase step was promised."
) {
  console.error("FAIL: A non-sales document stays Not a deal", wordCategory, wordMove, wordNotes);
  failed = true;
}
const stalledCategory = reportCategory({
  status: "STALLED — HIGH RISK",
  trajectory: "DEFERRED (recoverable)",
  recoverabilityStatus: "RECOVERABLE",
});
if (stalledCategory !== "deal_stalled" || !publishesStallMetrics(stalledCategory)) {
  console.error("FAIL: A real stalled deal still publishes stall metrics", stalledCategory);
  failed = true;
}
const referralClose = [
  "SELLER: They're probably doing about $500,000 to $1 million in revenue annually.",
  "SELLER: someone messaged me. And I'll book a call.",
  channelCall,
  "PROSPECT: But if you think that I'm going to be your client, no way a room full of 40 people, I'm going to be the client to the 40.",
  "SELLER: Yeah, yeah, and you don't have the budget for it either.",
  "SELLER: I'll send you a link to our clarity consultation framework. Unfortunately, it's not free, and I'm not going to push you. I'll just send you the link.",
].join("\n");
const referralDiag = diagnosticProfile(referralClose);
if (
  !/referral relationship/i.test(referralDiag.buyingSignals) ||
  !referralDiag.budget.startsWith("Consultation budget was not qualified") ||
  !/not as this person's ability or willingness to pay/i.test(referralDiag.budget) ||
  !referralDiag.urgency.startsWith("MISSING — NO TIMELINE") ||
  !/calendar time/i.test(referralDiag.missedProcess) ||
  !/not evidence that a sale was lost/i.test(referralDiag.missedProcess) ||
  /500,000|\$1 million|Budget was discussed|Budget was qualified/i.test(referralDiag.budget) ||
  /partnership meeting|CRITICAL/i.test(JSON.stringify(referralDiag))
) {
  console.error("FAIL: A referral close still reports the missing qualification", referralDiag);
  failed = true;
}
const wrappedRefusal = diagnosticProfile(
  [
    "PROSPECT: But if you think that I'm going to be your client, no way a",
    "room full of 40 people, I'm going to be the client to the 40.",
    "SELLER: I'm not here to like close you. You can be a channel partner.",
  ].join("\n")
);
if (!/be the client to the 40/i.test(wrappedRefusal.buyingSignals)) {
  console.error("FAIL: A wrapped refusal should stay one quote", wrappedRefusal);
  failed = true;
}
const budgetAndRefusal = [
  "PROSPECT: I am not going to be your client. I might be the referral.",
  "PROSPECT: We can talk budget some other time.",
].join("\n");
if (purchaseMotion(budgetAndRefusal).motion !== "not_a_deal" || isNotAPurchase(budgetAndRefusal) === false) {
  console.error("FAIL: The word budget does not open a purchase after a client-role refusal", purchaseMotion(budgetAndRefusal));
  failed = true;
}
const unlabeledCall = "I will not be your client. We can talk budget later.";
const unlabeledMotion = purchaseMotion(unlabeledCall);
const unlabeledCategory = reportCategory({
  status: "STALLED — HIGH RISK",
  trajectory: "DEFERRED (recoverable)",
  transcript: unlabeledCall,
});
if (unlabeledMotion.motion !== "unresolved" || unlabeledCategory !== "unresolved" || publishesStallMetrics(unlabeledCategory)) {
  console.error("FAIL: An unlabeled transcript stays unresolved and publishes no stall metrics", unlabeledMotion, unlabeledCategory);
  failed = true;
}
if (!/own service/i.test(referralDiag.falseRead) || !/does not reopen/i.test(referralDiag.restart)) {
  console.error("FAIL: A referral call names the false read and refuses a restart", referralDiag);
  failed = true;
}
if (/500,000|\$1 million/.test(referralDiag.budget)) {
  console.error("FAIL: Seller revenue is not the buyer's budget", referralDiag.budget);
  failed = true;
}
const repWin = readFileSync("fixtures/rep_claims_win_transcript.txt", "utf-8");
const repWinDiag = diagnosticProfile(repWin);
if (!/closed-won/i.test(repWinDiag.falseRead) || !/nothing is signed/i.test(repWinDiag.falseRead)) {
  console.error("FAIL: A rep's closed-won claim stays apart from the buyer's words", repWinDiag.falseRead);
  failed = true;
}
const sarahRestart = diagnosticProfile(sarahMarkTranscript);
if (!/Dave buys in/i.test(sarahRestart.restart)) {
  console.error("FAIL: A stalled deal restarts only on the condition the buyer named", sarahRestart.restart);
  failed = true;
}
const sarahDiag = diagnosticProfile(sarahMarkTranscript);
if (
  sarahDiag.budget.startsWith("MISSING") ||
  !/qualified for this purchase/i.test(sarahDiag.budget) ||
  sarahDiag.urgency.startsWith("MISSING") ||
  /did not secure a decision/i.test(sarahDiag.missedProcess) ||
  !/interest in this purchase/i.test(sarahDiag.buyingSignals)
) {
  console.error("FAIL: A real stalled deal keeps its budget, timeline, and buying signal", sarahDiag);
  failed = true;
}
const userFiles = [
  ["fixtures/successful_deal_transcript.txt", "deal_closed"],
  ["fixtures/transcript_1_velocity_deal.txt", "deal_closed"],
  ["fixtures/cybercore_discovery_call.txt", "deal_closed"],
  ["fixtures/sarah_cold_call_transcript.txt", "unresolved"],
  ["fixtures/transcript_3_federal_audit.txt", "deal_open"],
  ["fixtures/failed_deal_transcript.txt", "deal_closed"],
];
for (const [file, expected] of userFiles) {
  const text = readFileSync(file, "utf-8");
  const motion = purchaseMotion(text).motion;
  if (motion !== expected) {
    console.error(`FAIL: ${file} should be ${expected}, got ${motion}`);
    failed = true;
  }
}
const coldCategory = reportCategory({
  status: "STALLED — HIGH RISK",
  trajectory: "DEFERRED (recoverable)",
  transcript: readFileSync("fixtures/sarah_cold_call_transcript.txt", "utf-8"),
});
if (coldCategory !== "unresolved" || publishesStallMetrics(coldCategory)) {
  console.error("FAIL: A first call that only books a look does not get stall metrics", coldCategory);
  failed = true;
}
const repDenied = reportCategory({
  status: "CLOSED WON",
  trajectory: "VALIDATED / VELOCITY",
  transcript: repWin,
});
if (repDenied === "deal_closed") {
  console.error("FAIL: The rep's closed-won label does not survive the buyer's nothing-is-signed");
  failed = true;
}
const velocityDiag = diagnosticProfile(readFileSync("fixtures/transcript_1_velocity_deal.txt", "utf-8"));
if (!/320,000/.test(velocityDiag.budget)) {
  console.error("FAIL: A closed deal keeps the buyer's stated budget", velocityDiag.budget);
  failed = true;
}
const auditDiag = diagnosticProfile(readFileSync("fixtures/transcript_3_federal_audit.txt", "utf-8"));
if (/Nothing over \$200K gets signed/.test(auditDiag.budget)) {
  console.error("FAIL: A spending cap is not a qualified budget", auditDiag.budget);
  failed = true;
}
const cyberDiag = diagnosticProfile(readFileSync("fixtures/cybercore_discovery_call.txt", "utf-8"));
if (/45,000|per day/.test(cyberDiag.budget)) {
  console.error("FAIL: The seller's cost-of-problem figure is not the buyer's budget", cyberDiag.budget);
  failed = true;
}
const coldText = readFileSync("fixtures/sarah_cold_call_transcript.txt", "utf-8");
const coldDiag = diagnosticProfile(coldText);
if (
  purchaseMotion(coldText).motion !== "unresolved" ||
  !/never opened a purchase/i.test(coldDiag.falseRead) ||
  publishesStallMetrics(reportCategory({ status: "STALLED — HIGH RISK", transcript: coldText }))
) {
  console.error("FAIL: A labeled call with no purchase names that false read and hides stall metrics", coldDiag.falseRead);
  failed = true;
}
const bareRefusal = "PROSPECT: We have a budget of $40,000. I am not going to be your client.\nSELLER: Understood.";
const bareDiag = diagnosticProfile(bareRefusal);
if (
  purchaseMotion(bareRefusal).motion !== "not_a_deal" ||
  /qualified for this purchase/i.test(bareDiag.budget) ||
  /promised link/i.test(bareDiag.restart) ||
  promisedRelationshipSteps(bareRefusal).length !== 0 ||
  /exchange of introductions|referral relationship/i.test(`${bareDiag.implied} ${bareDiag.buyingSignals}`)
) {
  console.error("FAIL: A refusal with a dollar amount does not qualify budget or invent a link", bareDiag, promisedRelationshipSteps(bareRefusal));
  failed = true;
}
const gongPaste = "Me: Our customers do about $2 million.\nThem: I am not going to be your client.";
const gongDiag = diagnosticProfile(gongPaste);
if (purchaseMotion(gongPaste).motion !== "unresolved" || /qualified for this purchase|2 million/i.test(gongDiag.budget)) {
  console.error("FAIL: Me and Them stay unresolved and do not qualify revenue", purchaseMotion(gongPaste), gongDiag.budget);
  failed = true;
}
const firstNames = "Jordan: The downtime is costing you $45,000 per day.\nCasey: Pull the plug. We signed with the other vendor yesterday.";
const firstDiag = diagnosticProfile(firstNames);
if (purchaseMotion(firstNames).motion !== "unresolved" || /qualified for this purchase|45,000/i.test(firstDiag.budget)) {
  console.error("FAIL: Two first names with no role stay unresolved", purchaseMotion(firstNames), firstDiag.budget);
  failed = true;
}
const coldQualify = readFileSync("fixtures/daniel_cold_qualification.txt", "utf-8");
const coldTurns = parseTurns(coldQualify);
const coldSeller = coldTurns.turns.filter((turn) => turn.role === "seller").map((turn) => turn.speaker);
const coldBuyer = coldTurns.turns.filter((turn) => turn.role === "buyer").map((turn) => turn.speaker);
const coldMotion = purchaseMotion(coldQualify);
const coldQualifyDiag = diagnosticProfile(coldQualify);
if (
  !coldTurns.labeled ||
  !coldSeller.some((name) => /^Marcus$/i.test(name)) ||
  !coldBuyer.some((name) => /^Daniel$/i.test(name)) ||
  coldSeller.some((name) => /^Daniel$/i.test(name)) ||
  coldMotion.motion !== "unresolved" ||
  !/never opened a purchase/i.test(coldQualifyDiag.falseRead) ||
  !/timeline was stated/i.test(coldQualifyDiag.urgency) ||
  !/five months|three-week|six-to-eight-week|annual planning/i.test(coldQualifyDiag.urgency) ||
  /looking to buy|send a proposal|we can accelerate/i.test(coldQualifyDiag.buyingSignals)
) {
  console.error("FAIL: Cold qualification keeps seller/buyer roles, keeps the timeline, and does not treat pain as a purchase", {
    coldSeller,
    coldBuyer,
    coldMotion,
    urgency: coldQualifyDiag.urgency,
    buyingSignals: coldQualifyDiag.buyingSignals,
    falseRead: coldQualifyDiag.falseRead,
  });
  failed = true;
}
const sarahClosed = reportCategory({
  status: "CLOSED WON",
  trajectory: "VALIDATED / VELOCITY",
  transcript: readFileSync("fixtures/sarah_mark_transcript.txt", "utf-8"),
});
if (sarahClosed !== "deal_stalled") {
  console.error("FAIL: A closed-won stage does not close a purchase the buyer left open", sarahClosed);
  failed = true;
}
if (reportCategory({ status: "STALLED — HIGH RISK", transcript: "" }) !== "unresolved") {
  console.error("FAIL: An empty transcript stays unresolved");
  failed = true;
}
const messy = readFileSync("fixtures/cybercore_messy_paste.txt", "utf-8");
const messyDiag = diagnosticProfile(messy);
if (purchaseMotion(messy).motion !== "deal_closed" || /45,000|150,000|per day/.test(messyDiag.budget)) {
  console.error("FAIL: A glued header paste keeps seller money off the budget and still closes", purchaseMotion(messy).motion, messyDiag.budget);
  failed = true;
}
const auditText = readFileSync("fixtures/transcript_3_federal_audit.txt", "utf-8");
const auditFresh = diagnosticProfile(auditText);
if (auditFresh.urgency.startsWith("MISSING") || /Nothing over|qualified for this purchase/i.test(auditFresh.budget)) {
  console.error("FAIL: A 90-day freeze is a timeline and the cap is not a budget", auditFresh.urgency, auditFresh.budget);
  failed = true;
}
if (
  lifecyclePhaseFromStatus("NOT A PURCHASE") !== "not_a_purchase" ||
  lifecyclePhaseFromStatus("MOTION NOT ESTABLISHED") !== "motion_not_established" ||
  publishesLifecycleScores("not_a_purchase") ||
  publishesLifecycleScores("motion_not_established") ||
  scoreMovement("stalled_recoverable") !== "stalled_recoverable"
) {
  console.error("FAIL: Off-forecast threads publish no score movement, and a stalled deal stays stalled");
  failed = true;
}
if (!channelNotes.includes("### Diagnostic evaluation") || !channelNotes.includes("Buying signals:")) {
  console.error("FAIL: The overview prints the diagnostic even when it is not a deal", channelNotes);
  failed = true;
}
const channelMatrix = validateReportMatrix({
  status: "NOT A PURCHASE",
  viability: 41,
  recoverabilityStatus: "FLAT_NO",
  forces: [],
  immediateActionCount: 1,
  transcript: channelCall,
  stakeholders: [
    {
      name: "[REDACTED NAME]",
      role: "Small-business owner / Solopreneur",
      persona_type: "Economic owner",
      evidence: "I started my finance and the residential piece.",
    },
  ],
});
if (!channelMatrix.passed) {
  console.error("FAIL: A corrected non-purchase should pass the report matrix", channelMatrix.checks);
  failed = true;
}
const rawMatrix = validateReportMatrix({
  status: "STALLED — LOW RISK",
  riskTier: "LOW",
  viability: 41,
  recoverabilityStatus: "UNDETERMINED",
  forces: [],
  immediateActionCount: 1,
  transcript: channelCall,
  stakeholders: [
    {
      name: "[REDACTED NAME]",
      role: "Small-business owner / Solopreneur",
      persona_type: "Suppressed Champion",
      evidence: "I started my finance and the residential piece.",
    },
    referral,
  ],
});
const purchaseCheck = rawMatrix.checks.find((check) => check.id === "purchase_motion");
const peopleCheck = rawMatrix.checks.find((check) => check.id === "people_map");
if (!purchaseCheck || purchaseCheck.passed || !peopleCheck || peopleCheck.passed) {
  console.error("FAIL: The old mislabel should fail the report matrix", rawMatrix.checks);
  failed = true;
}

const permanentBan = deriveCanonicalState(
  [
    {
      factor: "Purchase prohibited",
      type: "Constraint",
      weight: 100,
      evidence: "New software purchases are prohibited. This is a permanent structural lock.",
    },
  ],
  "PERMANENT STRUCTURAL LOCK"
);
const permanentForecast = forecastGuidance({
  status: "STALLED — HIGH RISK",
  trajectory: permanentBan.frozen.trajectory_type,
  recoverability: permanentBan.frozen.viability_score,
  viabilityState: permanentBan.frozen.viability_state,
});
if (permanentBan.frozen.viability_state !== "NON-VIABLE (STRUCTURALLY LOCKED)" || permanentForecast.line !== NON_VIABLE_FORECAST_LINE) {
  console.error("FAIL: A permanent prohibition should stay non-viable", permanentBan.frozen, permanentForecast);
  failed = true;
}
if (permanentBan.frozen.recoverability.status !== "NOT_CURRENTLY_RECOVERABLE") {
  console.error("FAIL: A permanent prohibition should be not currently recoverable", permanentBan.frozen.recoverability);
  failed = true;
}

const matrixDeal = deriveCanonicalState(
  [
    {
      factor: "Discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence: "The company is freezing discretionary spending until the end of the quarter. Additional approval, technically.",
    },
    {
      factor: "CFO financial case",
      type: "Behavioral",
      weight: 80,
      evidence: "He wants a proper financial case and actual savings.",
    },
    {
      factor: "Technical capacity",
      type: "Behavioral",
      weight: 75,
      evidence: "She can't commit her team to another integration project this quarter.",
    },
    {
      factor: "Continued interest",
      type: "Intent",
      weight: 40,
      evidence: "The project hasn't disappeared.",
    },
  ],
  "STRUCTURAL LOCK-INS"
);
if (matrixDeal.frozen.constraint_pressure !== 75 || matrixDeal.frozen.structural_lock_in !== 90) {
  console.error("FAIL: A structural freeze and a resource limit stay on separate scores", {
    constraint: matrixDeal.frozen.constraint_pressure,
    structural: matrixDeal.frozen.structural_lock_in,
  });
  failed = true;
}
if (matrixDeal.frozen.viability_score !== 0) {
  console.error("FAIL: Viability can still floor at 0", matrixDeal.frozen.viability_score);
  failed = true;
}
if (matrixDeal.frozen.recoverability.status !== "CONDITIONALLY_RECOVERABLE") {
  console.error("FAIL: A temporary freeze with stated pursuit should stay conditionally recoverable", matrixDeal.frozen.recoverability);
  failed = true;
}
if (!matrixDeal.frozen.recoverability.explanation.toLowerCase().includes("viability")) {
  console.error("FAIL: Recoverability should explain the viability score", matrixDeal.frozen.recoverability.explanation);
  failed = true;
}
const freezeOnly = deriveCanonicalState(
  [
    {
      factor: "Discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
  ],
  "STRUCTURAL LOCK-INS"
);
if (freezeOnly.frozen.recoverability.status === "CONDITIONALLY_RECOVERABLE" || freezeOnly.frozen.recoverability.status === "NOT_CURRENTLY_RECOVERABLE") {
  console.error("FAIL: A temporary freeze without a stated path is undetermined", freezeOnly.frozen.recoverability);
  failed = true;
}
const competitorWon = deriveCanonicalState(
  [
    {
      factor: "Competitor selected",
      type: "Structural",
      weight: 80,
      evidence: "We selected FlowTrack and ended the evaluation.",
    },
    {
      factor: "Earlier interest",
      type: "Intent",
      weight: 40,
      evidence: "The project hasn't disappeared.",
    },
  ],
  "MIXED"
);
if (competitorWon.frozen.recoverability.status !== "NOT_CURRENTLY_RECOVERABLE") {
  console.error("FAIL: A selected competitor should close the current path without a permanent ban", competitorWon.frozen.recoverability);
  failed = true;
}
const keptOpen = deriveCanonicalState(
  [
    {
      factor: "Discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
  ],
  "STRUCTURAL LOCK-INS",
  "I don't think we should close the door. The project hasn't disappeared."
);
if (keptOpen.frozen.recoverability.status !== "CONDITIONALLY_RECOVERABLE") {
  console.error("FAIL: Refusing to close the door should stay a path", keptOpen.frozen.recoverability);
  failed = true;
}
const financial = matrixDeal.causal.forces.find((force) => force.factor === "CFO financial case");
if (financial?.score_effect?.included !== false) {
  console.error("FAIL: An overlapping financial case should not be counted twice", financial);
  failed = true;
}
const droppedCapacity = deriveCanonicalState(
  [
    {
      factor: "Discretionary Spending Freeze",
      type: "Constraint",
      weight: 75,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
    {
      factor: "CFO's Demand for Demonstrated Savings",
      type: "Constraint",
      weight: 70,
      evidence: "David wants us to demonstrate actual savings.",
    },
    {
      factor: "Competing Vendor Pilot (FlowTrack)",
      type: "Constraint",
      weight: 60,
      evidence: "They're piloting another platform.",
    },
    {
      factor: "Potential Implementation Delays",
      type: "Constraint",
      weight: 50,
      evidence: "Priya thinks it could take twelve to sixteen weeks because of integration and security reviews.",
    },
  ],
  "MIXED",
  "She told me she can't commit her team to another integration project this quarter."
);
const restoredCapacity = droppedCapacity.causal.forces.find((force) => /can't commit/i.test(force.evidence));
const countedConstraints = droppedCapacity.causal.forces.filter(
  (force) => force.score_effect?.included && force.score_effect.dimension === "constraint_pressure"
);
const countedSum = countedConstraints.reduce((total, force) => total + force.weight, 0);
if (droppedCapacity.frozen.constraint_pressure !== 75 || restoredCapacity?.score_effect?.included !== true) {
  console.error("FAIL: A stated resource limit should set constraint pressure even when extraction drops it", {
    constraint: droppedCapacity.frozen.constraint_pressure,
    restoredCapacity,
  });
  failed = true;
}
const freezeForce = droppedCapacity.causal.forces.find((force) => /freezing discretionary/i.test(force.evidence));
if (
  droppedCapacity.frozen.structural_lock_in !== 75 ||
  freezeForce?.score_effect?.dimension !== "structural_lock_in" ||
  freezeForce?.score_effect?.included !== true
) {
  console.error("FAIL: A discretionary spending freeze stays structural even when the model calls it a constraint", {
    structural: droppedCapacity.frozen.structural_lock_in,
    freezeForce,
  });
  failed = true;
}
if (countedSum !== 75 || droppedCapacity.frozen.constraint_pressure === countedSum + droppedCapacity.frozen.structural_lock_in) {
  console.error("FAIL: The spending freeze and the resource limit should not be added together", {
    constraint: droppedCapacity.frozen.constraint_pressure,
    structural: droppedCapacity.frozen.structural_lock_in,
    countedSum,
  });
  failed = true;
}
const estimateOnly = deriveCanonicalState(
  [
    {
      factor: "Potential Implementation Delays",
      type: "Constraint",
      weight: 50,
      evidence: "Priya thinks it could take twelve to sixteen weeks because of integration and security reviews.",
    },
  ],
  "MIXED",
  "Priya thinks it could take twelve to sixteen weeks because of integration and security reviews."
);
if (
  estimateOnly.causal.forces.some((force) => /can't commit|cannot commit capacity/i.test(`${force.factor} ${force.evidence}`)) ||
  estimateOnly.frozen.constraint_pressure !== 50
) {
  console.error("FAIL: An implementation estimate must not be rewritten as a capacity constraint", estimateOnly.causal.forces);
  failed = true;
}
const capacityOnly = deriveCanonicalState(
  [],
  "MIXED",
  "She told me she can't commit her team to another integration project this quarter."
);
const capacityForce = capacityOnly.causal.forces.find((force) => /can't commit/i.test(force.evidence));
if (
  !capacityForce ||
  capacityOnly.frozen.constraint_pressure !== 75 ||
  capacityOnly.causal.forces.some((force) => /twelve to sixteen/i.test(`${force.factor} ${force.evidence}`))
) {
  console.error("FAIL: A capacity limit without an implementation estimate should still set constraint pressure", {
    constraint: capacityOnly.frozen.constraint_pressure,
    forces: capacityOnly.causal.forces,
  });
  failed = true;
}
const estimateAndCapacity = deriveCanonicalState(
  [
    {
      factor: "Potential Implementation Delays",
      type: "Constraint",
      weight: 50,
      evidence: "Priya thinks it could take twelve to sixteen weeks because of integration and security reviews.",
    },
  ],
  "MIXED",
  "She told me she can't commit her team to another integration project this quarter."
);
const keptEstimate = estimateAndCapacity.causal.forces.find((force) => /twelve to sixteen/i.test(force.evidence));
const keptCapacity = estimateAndCapacity.causal.forces.find((force) => /can't commit/i.test(force.evidence));
if (!keptEstimate || !keptCapacity || keptEstimate === keptCapacity || estimateAndCapacity.frozen.constraint_pressure !== 75) {
  console.error("FAIL: An implementation estimate and a capacity limit should both be kept", {
    constraint: estimateAndCapacity.frozen.constraint_pressure,
    keptEstimate,
    keptCapacity,
  });
  failed = true;
}
const pilotOnly = deriveCanonicalState(
  [
    {
      factor: "Competing Vendor Pilot",
      type: "Constraint",
      weight: 90,
      evidence: "They're piloting another platform.",
    },
  ],
  "MIXED"
);
if (pilotOnly.frozen.constraint_pressure !== 0 || pilotOnly.frozen.structural_lock_in !== 0) {
  console.error("FAIL: A competitive pilot should not set constraint or structural pressure", pilotOnly.frozen);
  failed = true;
}
function labeledFreeze(type) {
  return deriveCanonicalState(
    [
      {
        factor: "Discretionary spending freeze",
        type,
        weight: 90,
        evidence: "The company is freezing discretionary spending until the end of the quarter.",
      },
      {
        factor: "Technical capacity",
        type: "Behavioral",
        weight: 75,
        evidence: "She can't commit her team to another integration project this quarter.",
      },
      {
        factor: "CFO financial case",
        type: "Behavioral",
        weight: 80,
        evidence: "He wants a proper financial case and actual savings.",
      },
    ],
    "MIXED"
  );
}
const freezeAsConstraint = labeledFreeze("Constraint");
const freezeAsStructural = labeledFreeze("Structural");
const samePressure =
  freezeAsConstraint.frozen.constraint_pressure === freezeAsStructural.frozen.constraint_pressure &&
  freezeAsConstraint.frozen.structural_lock_in === freezeAsStructural.frozen.structural_lock_in &&
  freezeAsConstraint.frozen.constraint_pressure === 75 &&
  freezeAsConstraint.frozen.structural_lock_in === 90;
const freezeScoredTwice = freezeAsConstraint.causal.forces.some(
  (force) => /discretionary spending/i.test(force.evidence) && force.score_effect?.dimension === "constraint_pressure"
);
if (!samePressure || freezeScoredTwice) {
  console.error("FAIL: The same spending-freeze evidence should score once, whichever type label it carries", {
    asConstraint: {
      constraint: freezeAsConstraint.frozen.constraint_pressure,
      structural: freezeAsConstraint.frozen.structural_lock_in,
    },
    asStructural: {
      constraint: freezeAsStructural.frozen.constraint_pressure,
      structural: freezeAsStructural.frozen.structural_lock_in,
    },
  });
  failed = true;
}
const doubledFreeze = deriveCanonicalState(
  [
    {
      factor: "Discretionary spending freeze",
      type: "Structural",
      weight: 90,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
    {
      factor: "Same freeze, second label",
      type: "Constraint",
      weight: 70,
      evidence: "The company is freezing discretionary spending until the end of the quarter.",
    },
  ],
  "MIXED"
);
if (doubledFreeze.frozen.structural_lock_in !== 90 || doubledFreeze.frozen.constraint_pressure !== 0) {
  console.error("FAIL: One spending freeze should not count under two labels", doubledFreeze.frozen);
  failed = true;
}
const matrixPi = deriveProprietaryIndices(matrixDeal.frozen, [], "");
if (!matrixPi.formula.includes("0.25×75") || !matrixPi.formula.includes("0.15×90")) {
  console.error("FAIL: Independent structural and constraint scores should both enter the risk formula", matrixPi.formula);
  failed = true;
}
const matrixStatus = statusFromTrajectory(matrixDeal.frozen.trajectory_type, "STALLED — HIGH RISK", matrixPi.risk_tier);
if (classifyRisk(50) !== "MODERATE" || matrixStatus !== stalledHeadline(matrixPi.risk_tier)) {
  console.error("FAIL: Headline must use the same tier as the risk score", classifyRisk(50), matrixStatus, matrixPi);
  failed = true;
}
if (matrixPi.risk_tier === "MODERATE" && matrixStatus.includes("HIGH RISK")) {
  console.error("FAIL: A moderate score must not be headlined as high risk", matrixStatus, matrixPi.deal_risk_index);
  failed = true;
}
const undetermined = deriveCanonicalState([], "MIXED");
if (undetermined.frozen.recoverability.status !== "UNDETERMINED") {
  console.error("FAIL: No evidence should leave recoverability undetermined", undetermined.frozen.recoverability);
  failed = true;
}
const actionList = canonicalImmediateActions({
  rescue_triage_plan: {
    immediate_0_30_days: [
      "[0-30d] P1 | Owner: Marcus | Stakeholder: Sarah | Action: Send the revised financial model. | Outcome: Sarah names a finance contact.",
    ],
  },
});
if (actionList.length !== 1 || !actionList[0].toLowerCase().includes("financial model")) {
  console.error("FAIL: The action summary should use the rescue plan", actionList);
  failed = true;
}

const northstarDialogue = [
  "**Marcus:** Is Priya willing to do that review?",
  "**Sarah:** She's willing, but she can't commit her team to another integration project this quarter. The company is freezing discretionary spending until the end of the quarter.",
  "**Sarah:** David wants a proper financial case before he will defend the spend. He's not against the project.",
].join("\n");

const marcusMisread = reconcilePersona(
  {
    name: "Marcus Reed",
    persona_type: "Resource constraint",
    evidence: "Is Priya willing to do that review?",
  },
  northstarDialogue
);
const priyaAttributed = reconcilePersona(
  {
    name: "Priya Shah",
    persona_type: "Absent Decision Maker",
    evidence: "She can't commit her team to another integration project this quarter.",
  },
  northstarDialogue
);
if (priyaAttributed.label !== "Resource constraint" || marcusMisread.label === "Resource constraint") {
  console.error("FAIL: Priya's capacity statement must stay with Priya", priyaAttributed, marcusMisread);
  failed = true;
}

const davidEvidence = {
  factor: "CFO financial case",
  type: "Constraint",
  weight: 85,
  evidence: "David wants a proper financial case before he will defend the spend.",
};
const freezeEvidence = {
  factor: "Discretionary spending freeze",
  type: "Constraint",
  weight: 90,
  evidence: "The company is freezing discretionary spending until the end of the quarter.",
};
const davidRunA = deriveCanonicalState([freezeEvidence, davidEvidence], "MIXED", northstarDialogue);
const davidRunB = deriveCanonicalState([freezeEvidence, davidEvidence], "MIXED", northstarDialogue);
const davidEffect = (run) =>
  run.causal.forces.find((force) => force.factor === "CFO financial case")?.score_effect;
if (
  JSON.stringify(davidEffect(davidRunA)) !== JSON.stringify(davidEffect(davidRunB)) ||
  davidEffect(davidRunA)?.included !== false
) {
  console.error("FAIL: David's financial case must classify the same way on identical evidence", davidEffect(davidRunA), davidEffect(davidRunB));
  failed = true;
}
const freezeEffect = davidRunA.causal.forces.find((force) => force.factor === "Discretionary spending freeze")?.score_effect;
if (freezeEffect?.dimension !== "structural_lock_in" || freezeEffect?.included !== true) {
  console.error("FAIL: The spending freeze must stay structural", freezeEffect);
  failed = true;
}

const independentFinancial = deriveCanonicalState(
  [
    freezeEvidence,
    davidEvidence,
    {
      factor: "Capital already committed",
      type: "Constraint",
      weight: 88,
      evidence: "The capital budget was already allocated elsewhere.",
    },
  ],
  "MIXED",
  northstarDialogue
);
const independent = independentFinancial.causal.forces.find((force) => force.factor === "Capital already committed");
if (independent?.score_effect?.included !== true || independentFinancial.frozen.constraint_pressure !== 88) {
  console.error("FAIL: An independent financial blocker must still score when a freeze exists", independent, independentFinancial.frozen.constraint_pressure);
  failed = true;
}

const dispersion = deriveProprietaryIndices(
  davidRunA.frozen,
  [
    { name: "Sarah Chen", persona_type: "Suppressed Champion", evidence: "I don't think we should close the door." },
    { name: "Marcus Reed", persona_type: "Resource constraint", evidence: "Is Priya willing to do that review?" },
    { name: "Priya Shah", persona_type: "Absent Decision Maker", evidence: "She can't commit her team to another integration project this quarter." },
  ],
  northstarDialogue
);
if (dispersion.stakeholder_dispersion.index !== 12) {
  console.error("FAIL: Dispersion must ignore a misattributed capacity statement", dispersion.stakeholder_dispersion);
  failed = true;
}
const attributedCapacity = davidRunA.causal.forces.find((force) => /can't commit/i.test(force.evidence));
if (
  attributedCapacity?.attribution?.speaker_id !== "Sarah" ||
  attributedCapacity?.attribution?.subject_id !== "Priya" ||
  attributedCapacity?.attribution?.attribution_confidence !== "high"
) {
  console.error("FAIL: Capacity evidence must record Sarah as speaker and Priya as subject", attributedCapacity?.attribution);
  failed = true;
}

let invalidRejected = false;
try {
  assertAnalysisSchema({});
} catch (err) {
  invalidRejected = err instanceof Error && /invalid analysis structure/.test(err.message);
}
if (!invalidRejected) {
  console.error("FAIL: Invalid model output must be rejected before a report is saved");
  failed = true;
}
try {
  assertAnalysisSchema({
    executive_summary: "The deal is deferred until the spending freeze lifts.",
    causal_forces: [
      {
        factor: "Discretionary spending freeze",
        type: "Structural",
        weight: 90,
        evidence: "The company is freezing discretionary spending until the end of the quarter.",
      },
    ],
  });
} catch (err) {
  console.error("FAIL: A string summary with forces is a valid model response", err);
  failed = true;
}

if (failed) process.exit(1);
console.log("\nSCORING + DRI REGRESSION OK");
console.log("  replay viability:", alexA.viability_score, alexA.trajectory_type);
