import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Company for this user. Null when they have no membership (guest path). */
export async function tenantIdForUser(userId: string | null | undefined): Promise<string | null> {
  const id = (userId ?? "").trim();
  if (!id) return null;
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", id)
    .maybeSingle();
  if (error || !data?.tenant_id) return null;
  return String(data.tenant_id);
}
