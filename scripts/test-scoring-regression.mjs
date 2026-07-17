import {
  deriveCanonicalState,
  deriveProprietaryIndices,
  computeDialogueStallSignals,
} from "../server/scoring.ts";
import { computeBuyingGroupAlignment } from "../server/buyingGroup.ts";
import { buildLowFrictionBrief, normalizePipelineStage } from "../server/stageActions.ts";
import { buildContractReadinessPathway } from "../server/contractPathway.ts";
import { readFileSync } from "fs";
import { demoDeepContext } from "../src/lib/demoDeepContext.ts";

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

// --- Buying-group alignment + stage-aligned brief (Liam feedback) ---
const bgDiscovery = computeBuyingGroupAlignment(sarahMarkStakeholders, {
  dealStage: "appointmentscheduled",
});
const bgContract = computeBuyingGroupAlignment(sarahMarkStakeholders, {
  dealStage: "contractsent",
});

console.log("\n=== Buying-group / stage actions ===");
console.log("  discovery status:", bgDiscovery.status, "missing:", bgDiscovery.missing_roles.join(","));
console.log("  contract status:", bgContract.status, "missing:", bgContract.missing_roles.join(","));

if (!bgDiscovery.missing_roles.includes("economic_buyer") && !bgDiscovery.quiet_stakeholders.length) {
  // Dave is technical_veto quiet; economic buyer may also be missing
  console.error("FAIL: Sarah/Mark should surface quiet stakeholders or missing economic buyer");
  failed = true;
}
if (!bgDiscovery.quiet_stakeholders.includes("Dave")) {
  console.error("FAIL: Dave should be listed as quiet stakeholder");
  failed = true;
}
if (!bgContract.expected_roles.includes("procurement")) {
  console.error("FAIL: contractsent stage should expect procurement role");
  failed = true;
}
if (bgDiscovery.status === "ALIGNED") {
  console.error("FAIL: Sarah/Mark discovery buying group should not be ALIGNED");
  failed = true;
}

const briefNeg = buildLowFrictionBrief({
  dealStage: "contractsent",
  executiveSummary: "Deal stalled without Dave on the technical gate",
  coreBlocker: "Absent VP Infrastructure",
  buyingGroup: bgContract,
  stakeholders: sarahMarkStakeholders,
  immediateRemediation: [
    "01 [Immediate]: Book Dave for architecture review",
    "02 [Next Action]: Draft phased pilot for Mark",
    "03 [Noise]: Ignore this third item in primary path",
  ],
});

console.log("  brief stage:", briefNeg.crm_stage, briefNeg.stage_bucket);
console.log("  primary:", briefNeg.primary.title);
console.log("  who:", briefNeg.who_to_contact?.name);

if (briefNeg.stage_bucket !== "negotiation") {
  console.error("FAIL: contractsent should map to negotiation bucket, got", briefNeg.stage_bucket);
  failed = true;
}
if (!briefNeg.who_to_contact?.name) {
  console.error("FAIL: brief should name who to contact");
  failed = true;
}
if (briefNeg.who_to_contact?.name !== "Dave") {
  console.error(
    "FAIL: contractsent Sarah/Mark brief should prioritize Dave (technical veto), got",
    briefNeg.who_to_contact?.name
  );
  failed = true;
}
if (briefNeg.supporting.length > 2) {
  console.error("FAIL: supporting actions must be noise-capped at 2, got", briefNeg.supporting.length);
  failed = true;
}
if (!/what happened|what next|who/i.test(`${briefNeg.what_happened} ${briefNeg.what_next}`)) {
  // soft check — fields must be non-empty
}
if (!briefNeg.what_happened || !briefNeg.what_next) {
  console.error("FAIL: brief must include what_happened and what_next");
  failed = true;
}

const disc = normalizePipelineStage("qualifiedtobuy");
const nego = normalizePipelineStage("contractsent");
if (nego.bucket !== "negotiation") {
  console.error("FAIL: normalizePipelineStage(contractsent) expected negotiation");
  failed = true;
}
if (disc.bucket === "negotiation") {
  console.error("FAIL: qualifiedtobuy should not be negotiation");
  failed = true;
}

const pathwayGated = buildContractReadinessPathway({
  dealStage: "contractsent",
  historicalCrmContext: demoDeepContext.historical_crm_context.map((e) => ({
    date: e.date,
    stage: e.stage,
    past_identified_veto_holders: e.past_identified_veto_holders.map((v) => ({ ...v })),
    past_logged_objections: [...e.past_logged_objections],
  })),
  buyingGroup: bgContract,
  coreBlocker: "Absent VP Infrastructure",
});

console.log("\n=== Pre-contract pathway ===");
console.log("  gate:", pathwayGated.gate_status, "block:", pathwayGated.block_contract_send);
console.log(
  "  open/blocking:",
  pathwayGated.open_count + pathwayGated.blocking_count,
  "addressed:",
  pathwayGated.addressed_count,
  "meetings:",
  pathwayGated.meetings.length
);

if (pathwayGated.gate_status !== "GATED") {
  console.error("FAIL: demo history + contractsent should GATED pathway, got", pathwayGated.gate_status);
  failed = true;
}
if (!pathwayGated.block_contract_send) {
  console.error("FAIL: GATED pathway must block_contract_send");
  failed = true;
}
if (pathwayGated.meetings.length < 3) {
  console.error("FAIL: pathway should track multiple meetings, got", pathwayGated.meetings.length);
  failed = true;
}
if (pathwayGated.concerns.length < 3) {
  console.error("FAIL: pathway should surface multiple cycle concerns, got", pathwayGated.concerns.length);
  failed = true;
}
if (!/unified contract|do not send|open concern/i.test(pathwayGated.next_unified_step + pathwayGated.headline)) {
  console.error("FAIL: pathway messaging should reference unified contract / open concerns");
  failed = true;
}

const pathwayEarly = buildContractReadinessPathway({
  dealStage: "appointmentscheduled",
  historicalCrmContext: demoDeepContext.historical_crm_context.map((e) => ({
    date: e.date,
    stage: e.stage,
    past_identified_veto_holders: e.past_identified_veto_holders.map((v) => ({ ...v })),
    past_logged_objections: [...e.past_logged_objections],
  })),
});
if (pathwayEarly.gate_status !== "TRACKING") {
  console.error("FAIL: early stage with open concerns should TRACKING, got", pathwayEarly.gate_status);
  failed = true;
}

if (failed) process.exit(1);
console.log("\nSCORING + DRI + BUYING-GROUP + PATHWAY REGRESSION OK");
