import { cancelBillingOnAccountDelete } from "./billing.js";
import { serviceRoleClient } from "./founderAuth.js";

export type AccountDeleteResult = {
  ok: true;
  deleted: {
    analyses: number;
    rescue_outcomes: number;
    crm_links: number;
  };
};

export async function deleteAccountCascade(userId: string): Promise<AccountDeleteResult> {
  const supabase = serviceRoleClient();
  if (!supabase) {
    throw new Error("Account deletion is not available (database not configured).");
  }

  await cancelBillingOnAccountDelete(userId);

  const { count: analyses } = await supabase
    .from("call_post_mortems")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  const { count: rescue } = await supabase
    .from("rescue_outcomes")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  const { count: links } = await supabase
    .from("crm_deal_links")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  await supabase.from("billing_customers").delete().eq("user_id", userId);
  await supabase.from("founder_account_notes").delete().eq("user_id", userId);
  await supabase.from("client_crashes").delete().eq("user_id", userId);
  await supabase.from("api_events").update({ user_id: null }).eq("user_id", userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    deleted: {
      analyses: analyses ?? 0,
      rescue_outcomes: rescue ?? 0,
      crm_links: links ?? 0,
    },
  };
}
