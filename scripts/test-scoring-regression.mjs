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
import { commercialBaselineFromText } from "../src/lib/commercialBaseline.ts";
import { DEFER_FORECAST_LINE, forecastGuidance, NON_VIABLE_FORECAST_LINE, NOT_A_PURCHASE_FORECAST_LINE } from "../src/lib/forecastCall.ts";
import { canonicalImmediateActions, classifyRecoverability, classifyRisk, diagnosticProfile, matrixFacing, promisedRelationshipSteps, publishesStallMetrics, purchaseMotion, recommendedMoveLine, reportCategory, stalledHeadline, validateReportMatrix } from "../src/lib/reportMatrix.ts";
import { formatCompressedCrmNotes } from "../src/lib/crmNotes.ts";
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
  channelSteps.length !== 3 ||
  !channelSteps.some((step) => /invitation/i.test(step)) ||
  channelSteps.some((step) => /partnership/i.test(step))
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
