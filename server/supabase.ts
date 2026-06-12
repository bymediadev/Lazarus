import { createClient } from "@supabase/supabase-js";
import {
  constraintBand,
  personaSignature,
  type ProprietaryIndices,
  type StakeholderIndexInput,
} from "./scoring.js";

export interface SavePostMortemInput {
  userId?: string;
  clientName: string;
  dealValue: number;
  dealStatus: string;
  headline: string;
  diagnosis: string;
  actionPlan: string;
  transcriptText?: string;
  analysisJson?: string;
}

export async function savePostMortem(input: SavePostMortemInput): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const supabase = createClient(url, key);

  const row: Record<string, unknown> = {
    user_id: input.userId ?? null,
    client_name: input.clientName,
    deal_value: input.dealValue,
    deal_status: input.dealStatus,
    stall_cause: input.headline,
    why_it_stalled: input.diagnosis,
    restart_plan: input.actionPlan,
    transcript_text: input.transcriptText ?? null,
  };
  if (input.analysisJson) {
    row.analysis_json = input.analysisJson;
  }

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

/** Null out transcript_text older than retention window. Keeps analysis_json for audit. */
export async function purgeExpiredTranscripts(retentionDays?: number): Promise<{
  purged: number;
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

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("call_post_mortems")
    .update({ transcript_text: null })
    .lt("created_at", cutoffIso)
    .not("transcript_text", "is", null)
    .select("id");

  if (error) {
    throw new Error(`Purge failed: ${error.message}`);
  }

  return { purged: data?.length ?? 0, retentionDays: days };
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

  const { data, error } = await supabase
    .from("rescue_outcomes")
    .insert({
      post_mortem_id: input.postMortemId ?? null,
      user_id: input.userId ?? null,
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

  return data.id;
}
