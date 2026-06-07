import { createClient } from "@supabase/supabase-js";

export interface SavePostMortemInput {
  userId?: string;
  clientName: string;
  dealValue: number;
  stallCause: string;
  whyItStalled: string;
  restartPlan: string;
  transcriptText?: string;
}

export async function savePostMortem(input: SavePostMortemInput): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("call_post_mortems")
    .insert({
      user_id: input.userId ?? null,
      client_name: input.clientName,
      deal_value: input.dealValue,
      stall_cause: input.stallCause,
      why_it_stalled: input.whyItStalled,
      restart_plan: input.restartPlan,
      transcript_text: input.transcriptText ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Supabase save failed:", error.message);
    return null;
  }

  return data.id;
}
