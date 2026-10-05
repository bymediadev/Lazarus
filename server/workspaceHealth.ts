import { serviceRoleClient } from "./founderAuth.js";
import { isGoogleConnected, loadGoogleTokens } from "./integrations/google/tokens.js";
import { isHubSpotConnected, loadHubSpotTokens } from "./integrations/hubspot/tokens.js";
import { isSalesforceConnected, loadSalesforceTokens } from "./integrations/salesforce/tokens.js";
import { isTeamsConnected, loadTeamsTokens } from "./integrations/teams/tokens.js";
import { isZoomConnected, loadZoomTokens } from "./integrations/zoom/tokens.js";
import {
  integrationLinkStatus,
  rollupIntegrationStatus,
  scrubWorkspaceHealthRow,
  type IntegrationLinkStatus,
  type WorkspaceHealthRow,
} from "./tenantScope.js";

type TokenShape = { access_token?: string; expires_at?: string } | null;

function statusForMembers(
  memberIds: string[],
  isConnected: (userId: string) => boolean,
  load: (userId: string) => TokenShape,
  now: number
): IntegrationLinkStatus {
  return rollupIntegrationStatus(
    memberIds.map((userId) => {
      const token = load(userId);
      const fromExpiry = integrationLinkStatus(token, now);
      if (fromExpiry === "expired") return "expired";
      if (!isConnected(userId)) return "not_connected";
      return fromExpiry;
    })
  );
}

/** Per-company connection status. Tokens and transcripts are not included. */
export async function buildWorkspaceHealth(now = Date.now()): Promise<WorkspaceHealthRow[]> {
  const supabase = serviceRoleClient();
  if (!supabase) return [];

  const [{ data: tenants, error: tenantErr }, { data: members, error: memberErr }] =
    await Promise.all([
      supabase.from("tenants").select("id, company_name").order("company_name", { ascending: true }),
      supabase.from("tenant_members").select("tenant_id, user_id"),
    ]);
  if (tenantErr) throw new Error(tenantErr.message);
  if (memberErr) throw new Error(memberErr.message);

  const membersByTenant = new Map<string, string[]>();
  for (const row of members ?? []) {
    const tenantId = String(row.tenant_id ?? "");
    const userId = String(row.user_id ?? "");
    if (!tenantId || !userId) continue;
    const list = membersByTenant.get(tenantId) ?? [];
    list.push(userId);
    membersByTenant.set(tenantId, list);
  }

  return (tenants ?? []).map((tenant) => {
    const memberIds = membersByTenant.get(String(tenant.id)) ?? [];
    const row = scrubWorkspaceHealthRow({
      tenant_id: String(tenant.id),
      company_name: String(tenant.company_name ?? ""),
      integrations: {
        google: statusForMembers(memberIds, isGoogleConnected, loadGoogleTokens, now),
        hubspot: statusForMembers(memberIds, isHubSpotConnected, loadHubSpotTokens, now),
        salesforce: statusForMembers(memberIds, isSalesforceConnected, loadSalesforceTokens, now),
        zoom: statusForMembers(memberIds, isZoomConnected, loadZoomTokens, now),
        teams: statusForMembers(memberIds, isTeamsConnected, loadTeamsTokens, now),
      },
    });
    return row;
  });
}
