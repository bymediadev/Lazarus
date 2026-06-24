import { computePipelineLeak, DEFAULT_PIPELINE_INPUTS } from "../src/lib/pipelineLeakCalc.ts";

const r = computePipelineLeak(DEFAULT_PIPELINE_INPUTS);

console.log("=== Pipeline Leak Calculator (defaults) ===");
console.log("  conversations:", r.totalConversations);
console.log("  meetings:", r.totalMeetings);
console.log("  closed:", r.dealsClosed);
console.log("  total leaked:", r.totalLeakedDeals);
console.log("  value per call:", r.valuePerCall.toFixed(2));
console.log("  revenue saved (team):", Math.round(r.teamRevenueSaved));
console.log("  commission saved (team):", Math.round(r.teamCommissionSaved));

let failed = false;

if (Math.abs(r.totalConversations - 120) > 0.01) failed = true;
if (Math.abs(r.totalMeetings - 24) > 0.01) failed = true;
if (Math.abs(r.dealsClosed - 7.2) > 0.01) failed = true;
if (Math.abs(r.totalLeakedDeals - 112.8) > 0.01) failed = true;
if (Math.abs(r.valuePerCall - 9) > 0.05) failed = true;
if (Math.abs(r.revenueSaved - 54_000) > 500) failed = true;
if (Math.abs(r.commissionSaved - 5_400) > 50) failed = true;
if (r.salesStaffCount !== 5) failed = true;
if (Math.abs(r.teamRevenueSaved - 270_000) > 500) failed = true;
if (Math.abs(r.teamLeakedDeals - 564) > 0.5) failed = true;

if (failed) {
  console.error("FAIL: pipeline leak defaults mismatch", r);
  process.exit(1);
}

console.log("\nPIPELINE LEAK CALC OK");
