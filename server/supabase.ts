import { createClient } from "@supabase/supabase-js";
import {
  constraintBand,
  personaSignature,
  type ProprietaryIndices,
  type StakeholderIndexInput,
} from "./scoring.js";
import { tenantIdForUser } from "./tenantMembership.js";
import {
  purgeAfterForRescueOutcome,
  storedReportColumns,
  tenantForReportWrite,
} from "./reportSanitize.js";
import { tenantStampForWrite } from "./tenantScope.js";

export interface SavePostMortemInput {
  userId?: string;
  tenantIdFromKey?: string | null;
  sourceRef?: string | null;
  clientName: string;
  dealValue: number;
  dealStatus: string;
  headline: string;
  diagnosis: string;
  actionPlan: string;
  transcriptText?: string;
  analysisJson?: string;
  ingestMetadata?: Record<string, unknown>;
  dealMemorySummary?: Record<string, unknown>;
}

export async function savePostMortem(input: SavePostMortemInput): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const supabase = createClient(url, key);

  const stored = storedReportColumns({
    dealStatus: input.dealStatus,
    analysisJson: input.analysisJson,
    dealMemorySummary: input.dealMemorySummary,
    injected: input,
  });
  const row: Record<string, unknown> = {
    user_id: input.userId ?? null,
    client_name: input.clientName,
    deal_value: input.dealValue,
    deal_status: input.dealStatus,
    stall_cause: input.headline,
    why_it_stalled: input.diagnosis,
    restart_plan: input.actionPlan,
    transcript_text: stored.transcript_text,
    source_ref: (input.sourceRef ?? "").trim() || null,
    purge_after: stored.purge_after,
  };
  if (stored.analysis_json) {
    row.analysis_json = stored.analysis_json;
  }
  if (stored.deal_memory_summary) {
    row.deal_memory_summary = stored.deal_memory_summary;
  }
  const membershipTenantId = input.userId ? await tenantIdForUser(input.userId) : null;
  row.tenant_id = tenantForReportWrite({
    userId: input.userId,
    membershipTenantId,
    tenantIdFromKey: input.tenantIdFromKey,
    body: input,
  });

  const { data, error } = await supabase
    .from("call_post_mortems")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase save failed:", error.message);
    return null;
  }

  return data.id;
}

export async function getPostMortemUserId(id: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !id) return null;
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("call_post_mortems")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data?.user_id) return null;
  return String(data.user_id);
}

/** Null out transcript_text older than retention window. Keeps analysis_json for audit. */
async function insertPurgeAuditLog(
  supabase: ReturnType<typeof createClient>,
  rowsAffected: number,
  retentionDays: number
): Promise<void> {
  const { error } = await supabase.from("purge_audit_log").insert({
    rows_affected: rowsAffected,
    retention_days: retentionDays,
  });
  if (error) {
    console.warn("Purge audit log insert failed:", error.message);
  }
}

export async function purgeExpiredTranscripts(retentionDays?: number): Promise<{
  purged: number;
  reportsDeleted: number;
  retentionDays: number;
} | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("Purge skipped: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    return null;
  }

  const days = retentionDays ?? parseInt(process.env.DATA_RETENTION_DAYS ?? "30", 10);
  if (!Number.isFinite(days) || days < 1) {
    throw new Error("DATA_RETENTION_DAYS must be a positive integer");
  }

  const supabase = createClient(url, key);

  let purged = 0;
  const { data: rpcCount, error: rpcError } = await supabase.rpc("purge_expired_transcripts", {
    retention_days: days,
  });

  if (!rpcError && typeof rpcCount === "number") {
    purged = rpcCount;
  } else {
    if (rpcError) {
      console.warn(
        "purge_expired_transcripts RPC failed, falling back to direct UPDATE:",
        rpcError.message
      );
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    const { data, error } = await supabase
      .from("call_post_mortems")
      .update({ transcript_text: null })
      .lt("created_at", cutoffIso)
      .not("transcript_text", "is", null)
      .select("id");

    if (error) {
      throw new Error(`Purge failed: ${error.message}`);
    }
    purged = data?.length ?? 0;
  }

  const reportsDeleted = await deleteFinishedReports(supabase);
  await insertPurgeAuditLog(supabase, purged + reportsDeleted, days);
  return { purged, reportsDeleted, retentionDays: days };
}

/** Delete reports whose purge_after has passed. Rescue outcomes stay. CRM links for those reports go first. */
async function deleteFinishedReports(supabase: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("call_post_mortems")
    .select("id")
    .lte("purge_after", now)
    .not("purge_after", "is", null);

  if (error) {
    throw new Error(`Finished-report lookup failed: ${error.message}`);
  }

  const ids = (data ?? []).map((row) => String(row.id)).filter(Boolean);
  if (ids.length === 0) return 0;

  const { error: linkError } = await supabase.from("crm_deal_links").delete().in("post_mortem_id", ids);
  if (linkError) {
    throw new Error(`CRM link purge failed: ${linkError.message}`);
  }

  const { error: deleteError } = await supabase.from("call_post_mortems").delete().in("id", ids);
  if (deleteError) {
    throw new Error(`Report purge failed: ${deleteError.message}`);
  }
  return ids.length;
}

export interface SaveRescueOutcomeInput {
  postMortemId?: string | null;
  userId?: string;
  proprietaryIndices: ProprietaryIndices;
  viabilityScore: number;
  trajectoryType: string;
  constraintPressure: number;
  stakeholders: StakeholderIndexInput[];
  rescueActionTaken: string;
  outcome: "closed_won" | "still_stalled" | "lost" | "unknown";
}

export async function saveRescueOutcome(input: SaveRescueOutcomeInput): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const supabase = createClient(url, key);
  const pi = input.proprietaryIndices;
  const membershipTenantId = await tenantIdForUser(input.userId);

  const { data, error } = await supabase
    .from("rescue_outcomes")
    .insert({
      post_mortem_id: input.postMortemId ?? null,
      user_id: input.userId ?? null,
      tenant_id: tenantStampForWrite(membershipTenantId, input),
      deal_risk_index: pi.deal_risk_index,
      viability_score: input.viabilityScore,
      trajectory_type: input.trajectoryType,
      constraint_band: constraintBand(input.constraintPressure),
      stakeholder_dispersion: pi.stakeholder_dispersion_index,
      persona_signature: personaSignature(input.stakeholders),
      rescue_action_taken: input.rescueActionTaken,
      outcome: input.outcome,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Rescue outcome save failed:", error.message);
    return null;
  }

  if (input.postMortemId) {
    const { error: purgeError } = await supabase
      .from("call_post_mortems")
      .update({ purge_after: purgeAfterForRescueOutcome(input.outcome) })
      .eq("id", input.postMortemId);
    if (purgeError) {
      console.error("Rescue outcome purge clock update failed:", purgeError.message);
    }
  }

  return data.id;
}

/** Delete one saved report now, and the CRM links that point at it. Rescue outcomes stay. */
export async function deleteStoredReport(postMortemId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const id = postMortemId.trim();
  if (!url || !key || !id) return false;

  const supabase = createClient(url, key);
  const { error: linkError } = await supabase.from("crm_deal_links").delete().eq("post_mortem_id", id);
  if (linkError) {
    console.error("CRM link wipe failed:", linkError.message);
    return false;
  }
  const { data, error } = await supabase.from("call_post_mortems").delete().eq("id", id).select("id");
  if (error) {
    console.error("Report wipe failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
