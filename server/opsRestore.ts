import { serviceRoleClient } from "./founderAuth.js";

export type RestoreSnapshotCounts = {
  call_post_mortems: number;
  rescue_outcomes: number;
  billing_customers: number;
  crm_deal_links: number;
  api_events: number;
  client_crashes: number;
  auth_users: number | null;
};

export type RestoreSnapshot = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  counts: RestoreSnapshotCounts;
  note: string | null;
};

async function countTable(table: string): Promise<number> {
  const supabase = serviceRoleClient();
  if (!supabase) return 0;
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.warn(`[restore] count ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countAuthUsers(): Promise<number | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  try {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    const total = (listed.data as { total?: number } | undefined)?.total;
    if (typeof total === "number") return total;
    return listed.data?.users?.length ?? 0;
  } catch {
    return null;
  }
}

export async function captureRestoreSnapshot(
  actorUserId: string | null,
  note?: string
): Promise<RestoreSnapshot> {
  const supabase = serviceRoleClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    call_post_mortems,
    rescue_outcomes,
    billing_customers,
    crm_deal_links,
    api_events,
    client_crashes,
    auth_users,
  ] = await Promise.all([
    countTable("call_post_mortems"),
    countTable("rescue_outcomes"),
    countTable("billing_customers"),
    countTable("crm_deal_links"),
    countTable("api_events"),
    countTable("client_crashes"),
    countAuthUsers(),
  ]);

  const counts: RestoreSnapshotCounts = {
    call_post_mortems,
    rescue_outcomes,
    billing_customers,
    crm_deal_links,
    api_events,
    client_crashes,
    auth_users,
  };

  const { data, error } = await supabase
    .from("ops_restore_snapshots")
    .insert({
      actor_user_id: actorUserId,
      counts,
      note: note?.trim() || "Pre-restore drill snapshot",
    })
    .select("id, created_at, actor_user_id, counts, note")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save restore snapshot");
  }

  return {
    id: String(data.id),
    created_at: String(data.created_at),
    actor_user_id: data.actor_user_id ? String(data.actor_user_id) : null,
    counts: data.counts as RestoreSnapshotCounts,
    note: data.note ? String(data.note) : null,
  };
}

export async function latestRestoreSnapshot(): Promise<RestoreSnapshot | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ops_restore_snapshots")
    .select("id, created_at, actor_user_id, counts, note")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    created_at: String(data.created_at),
    actor_user_id: data.actor_user_id ? String(data.actor_user_id) : null,
    counts: data.counts as RestoreSnapshotCounts,
    note: data.note ? String(data.note) : null,
  };
}

export const RESTORE_RUNBOOK = [
  "Supabase Dashboard → Project Lazarus → Database → Backups.",
  "Do not restore over production on the first try. Create a new project or branch, restore the latest backup there.",
  "Copy that project's URL + service role into a local .env (not Render).",
  "Run the product locally, sign in, open one saved deal, confirm the brief and client name match this snapshot.",
  "If counts after restore are far below this snapshot, stop — that backup is incomplete.",
];
