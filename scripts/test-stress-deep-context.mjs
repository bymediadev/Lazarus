/**
 * Stress test: extended deep-context payload with veto_holder_id objects,
 * live_session_objections, and a historical entry outside the sales-cycle window.
 *
 * Usage: npm run test:stress-deep-context
 * Requires dev server on LAZARUS_API_URL (default http://localhost:3001).
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.LAZARUS_API_URL ?? "http://localhost:3001";
const baseFixture = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/sample_deep_context.json"), "utf-8")
);

const stressPayload = {
  ...baseFixture,
  sales_cycle_days: 180,
  historical_crm_context: [
    {
      date: "2024-06-01",
      stage: "Initial Outreach",
      past_identified_veto_holders: [
        { veto_holder_id: "legacy-cfo", display_name: "CFO — budget gate (stale)" },
      ],
      past_logged_objections: ["No budget until next fiscal year"],
    },
    ...baseFixture.historical_crm_context,
    {
      date: "2026-06-20",
      stage: "Security Review",
      past_identified_veto_holders: [
        { veto_holder_id: "sarah-chen-risk-compliance", display_name: "Sarah Chen — Risk & Compliance" },
        { veto_holder_id: "infosec-lead", display_name: "InfoSec Lead — unnamed" },
      ],
      past_logged_objections: [
        "SOC 2 Type II required before any data processing",
        "Pen test results must be shared with third-party assessor",
      ],
    },
  ],
  live_session_objections: [
    ...(baseFixture.live_session_objections ?? []),
    {
      text: "Federal audit window blocks signature until Q3",
      status: "open",
      source: "meeting_companion",
    },
    {
      text: "Procurement requires three-vendor comparison",
      status: "resolved",
      source: "manual",
    },
    {
      text: "Legal wants redlines on indemnification clause",
      status: "open",
      source: "meeting_companion",
    },
  ],
  live_transcript_payload: [
    ...(baseFixture.live_transcript_payload ?? []),
    {
      speaker: "Prospect (Mark)",
      timestamp: "00:07:30",
      dialogue:
        "Sarah from Risk still hasn't signed off on the DPA. Procurement also wants the three-vendor sheet before they'll schedule anything.",
    },
    {
      speaker: "Rep",
      timestamp: "00:08:45",
      dialogue:
        "We can send the SOC 2 and updated proposal async — Legal can review the indemnification language offline.",
    },
  ],
};

async function main() {
  const health = await fetch(`${API}/api/health`);
  if (!health.ok) {
    throw new Error(`Health check failed (${health.status})`);
  }
  console.log("Health OK");

  const form = new FormData();
  form.append("deal_value", "875000");
  form.append("account_id", stressPayload.account_id);
  form.append("sales_cycle_days", String(stressPayload.sales_cycle_days));
  form.append("historical_crm_context", JSON.stringify(stressPayload.historical_crm_context));
  form.append("live_transcript_payload", JSON.stringify(stressPayload.live_transcript_payload));
  form.append("live_session_objections", JSON.stringify(stressPayload.live_session_objections));

  console.log("\nStress payload summary:");
  console.log({
    account_id: stressPayload.account_id,
    sales_cycle_days: stressPayload.sales_cycle_days,
    historical_entries: stressPayload.historical_crm_context.length,
    veto_holder_objects: stressPayload.historical_crm_context.flatMap(
      (e) => e.past_identified_veto_holders
    ).length,
    live_session_objections: stressPayload.live_session_objections.length,
    transcript_turns: stressPayload.live_transcript_payload.length,
  });

  console.log("\nPOST /api/post-mortem (stress deep-context)...");
  const started = Date.now();
  const res = await fetch(`${API}/api/post-mortem`, { method: "POST", body: form });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const data = await res.json();

  if (!res.ok) {
    console.error(`FAILED (${res.status}) after ${elapsed}s:`, data.error ?? data);
    process.exit(1);
  }

  console.log(`OK in ${elapsed}s — post-mortem id: ${data.id ?? "(not persisted)"}\n`);

  console.log("=== LIVE DEAL TRIAGE ===");
  console.log(JSON.stringify(data.live_deal_triage ?? null, null, 2));
  console.log("\n=== FRICTION DELTAS (detected flags only) ===");
  const fd = data.friction_deltas;
  if (fd) {
    console.log({
      administrative_gatekeeping: fd.administrative_gatekeeping?.detected,
      stakeholder_dispersion: fd.stakeholder_dispersion?.detected,
      budget_scoping_gap: fd.budget_scoping_gap?.detected,
    });
  }
  console.log("\n=== HISTORICAL CONTEXT MATCH ===");
  console.log(JSON.stringify(data.historical_context_match ?? [], null, 2));
  console.log("\n=== SCORING ===");
  console.log({
    status: data.deal_classification?.status ?? data.deal_status,
    dri: data.proprietary_indices?.deal_risk_index,
    viability: data.viability_state?.viability_score,
    trajectory: data.deal_trajectory?.trajectory_type,
    client: data.client_name,
  });
  if (data.warnings?.length) {
    console.log("\n=== WARNINGS ===");
    data.warnings.forEach((w) => console.log("-", w));
  }
  console.log("\nSTRESS DEEP-CONTEXT OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
