import { deriveCanonicalState } from "../server/scoring.ts";

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

const v = deriveCanonicalState(velocityForces, "MIXED").frozen;
const a = deriveCanonicalState(auditForces, "TEMPORARY BLOCKERS").frozen;

console.log("=== Transcript 1: Velocity Deal ===");
console.log("  viability:", v.viability_score, "trajectory:", v.trajectory_type, "state:", v.viability_state);
console.log("  enabler:", v.enabler_strength, "constraint:", v.constraint_pressure, "effective:", v.effective_intent);

console.log("\n=== Transcript 3: Federal Audit Stall ===");
console.log("  viability:", a.viability_score, "trajectory:", a.trajectory_type, "state:", a.viability_state);
console.log("  constraint:", a.constraint_pressure, "effective:", a.effective_intent);

let failed = false;

if (v.viability_score < 70) {
  console.error("FAIL: Velocity deal viability should be >= 70, got", v.viability_score);
  failed = true;
}
if (v.trajectory_type !== "VALIDATED / VELOCITY") {
  console.error("FAIL: Velocity trajectory should be VALIDATED / VELOCITY, got", v.trajectory_type);
  failed = true;
}
if (v.constraint_pressure > 0 && v.enabler_strength >= 50) {
  // enabler path should have near-zero constraint
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

if (failed) process.exit(1);
console.log("\nSCORING REGRESSION OK");
