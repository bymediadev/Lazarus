import { createClient } from "@supabase/supabase-js";

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
