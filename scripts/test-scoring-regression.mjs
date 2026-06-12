import {
  deriveCanonicalState,
  deriveProprietaryIndices,
  computeDialogueStallSignals,
} from "../server/scoring.ts";
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

if (failed) process.exit(1);
console.log("\nSCORING + DRI REGRESSION OK");
