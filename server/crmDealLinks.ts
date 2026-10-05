import { createClient } from "@supabase/supabase-js";
import type { HistoricalCrmContextEntry } from "../shared/deepContextTypes.js";
import { tenantIdForUser } from "./tenantMembership.js";
import { crmLinkWriteFields } from "./reportSanitize.js";
import { tenantStampForWrite } from "./tenantScope.js";
import { deleteStoredReport } from "./supabase.js";
import { crmLinkWriteAllowed } from "./oauthIdentity.js";

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
  portalId?: string | null;
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
  void input.historicalCrmContext;

  const portalId = (input.portalId ?? "").trim();
  const existing = await getCrmDealLinkByExternalId(input.provider, input.externalDealId, portalId);
  if (existing && !crmLinkWriteAllowed(existing.user_id, input.userId)) {
    console.error("crm_deal_links ownership conflict");
    return null;
  }

  const row: Record<string, unknown> = {
    provider: input.provider,
    portal_id: portalId,
    external_deal_id: input.externalDealId,
    updated_at: new Date().toISOString(),
  };
  if (input.postMortemId !== undefined) row.post_mortem_id = input.postMortemId;
  if (input.userId && (!existing?.user_id || existing.user_id === input.userId)) {
    row.user_id = input.userId;
  }
  if (input.accountId !== undefined) row.account_id = input.accountId;
  if (input.salesCycleDays !== undefined) row.sales_cycle_days = input.salesCycleDays;
  Object.assign(row, crmLinkWriteFields(row));
  if (input.lastInboundAt) row.last_inbound_at = input.lastInboundAt;
  if (input.lastOutboundAt) row.last_outbound_at = input.lastOutboundAt;
  if (input.userId && row.user_id) {
    row.tenant_id = tenantStampForWrite(await tenantIdForUser(input.userId), input);
  }

  if (existing) {
    const { error } = await supabase.from("crm_deal_links").update(row).eq("id", existing.id);
    if (error) {
      console.error("crm_deal_links update failed:", error.message);
      return null;
    }
    return existing.id;
  }

  const { data, error } = await supabase.from("crm_deal_links").insert(row).select("id").single();

  if (error) {
    console.error("crm_deal_links insert failed:", error.message);
    return null;
  }
  return data.id as string;
}

/** Webhooks identify the connected user, then copy that membership onto the link. */
export async function stampCrmLinkTenantFromUser(linkId: string, userId: string): Promise<void> {
  const supabase = adminClient();
  if (!supabase || !linkId || !userId) return;
  const tenantId = tenantStampForWrite(await tenantIdForUser(userId));
  if (!tenantId) return;
  const { error } = await supabase
    .from("crm_deal_links")
    .update({ tenant_id: tenantId, updated_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) {
    console.error("crm_deal_links tenant stamp failed:", error.message);
  }
}

/** CRM marked the deal complete. Delete the saved report on our side. */
export async function wipeReportForClosedCrmDeal(
  provider: CrmProvider,
  externalDealId: string,
  portalId = ""
): Promise<boolean> {
  const existing = await getCrmDealLinkByExternalId(provider, externalDealId, portalId);
  if (!existing?.post_mortem_id) return false;
  return deleteStoredReport(existing.post_mortem_id);
}

export async function getCrmDealLinkByExternalId(
  provider: CrmProvider,
  externalDealId: string,
  portalId = ""
): Promise<CrmDealLinkRow | null> {
  const supabase = adminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("crm_deal_links")
    .select("*")
    .eq("provider", provider)
    .eq("portal_id", portalId)
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
    .update({
      ...crmLinkWriteFields(patch as Record<string, unknown>),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("crm_deal_links update failed:", error.message);
    return false;
  }
  return true;
}
