import { createClient } from "@supabase/supabase-js";
import type { HistoricalCrmContextEntry } from "../shared/deepContextTypes.js";

export type CrmProvider = "hubspot" | "salesforce";

export interface CrmDealLinkRow {
  id: string;
  provider: CrmProvider;
  external_deal_id: string;
  post_mortem_id: string | null;
  user_id: string | null;
  account_id: string | null;
  sales_cycle_days: number | null;
  historical_crm_context: HistoricalCrmContextEntry[] | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function upsertCrmDealLink(input: {
  provider: CrmProvider;
  externalDealId: string;
  postMortemId?: string | null;
  userId?: string | null;
  accountId?: string;
  salesCycleDays?: number;
  historicalCrmContext?: HistoricalCrmContextEntry[];
  lastInboundAt?: string;
  lastOutboundAt?: string;
}): Promise<string | null> {
  const supabase = adminClient();
  if (!supabase) return null;

  const row: Record<string, unknown> = {
    provider: input.provider,
    external_deal_id: input.externalDealId,
    updated_at: new Date().toISOString(),
  };
  if (input.postMortemId !== undefined) row.post_mortem_id = input.postMortemId;
  if (input.userId !== undefined) row.user_id = input.userId;
  if (input.accountId !== undefined) row.account_id = input.accountId;
  if (input.salesCycleDays !== undefined) row.sales_cycle_days = input.salesCycleDays;
  if (input.historicalCrmContext !== undefined) {
    row.historical_crm_context = input.historicalCrmContext;
  }
  if (input.lastInboundAt) row.last_inbound_at = input.lastInboundAt;
  if (input.lastOutboundAt) row.last_outbound_at = input.lastOutboundAt;

  const { data, error } = await supabase
    .from("crm_deal_links")
    .upsert(row, { onConflict: "provider,external_deal_id" })
    .select("id")
    .single();

  if (error) {
    console.error("crm_deal_links upsert failed:", error.message);
    return null;
  }
  return data.id as string;
}

export async function getCrmDealLinkByExternalId(
  provider: CrmProvider,
  externalDealId: string
): Promise<CrmDealLinkRow | null> {
  const supabase = adminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("crm_deal_links")
    .select("*")
    .eq("provider", provider)
    .eq("external_deal_id", externalDealId)
    .maybeSingle();

  if (error) {
    console.error("crm_deal_links fetch failed:", error.message);
    return null;
  }
  return (data as CrmDealLinkRow) ?? null;
}

export async function updateCrmDealLinkContext(
  id: string,
  patch: {
    historical_crm_context?: HistoricalCrmContextEntry[];
    sales_cycle_days?: number;
    last_inbound_at?: string;
    last_outbound_at?: string;
    post_mortem_id?: string;
  }
): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("crm_deal_links")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("crm_deal_links update failed:", error.message);
    return false;
  }
  return true;
}
