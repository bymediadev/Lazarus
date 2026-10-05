/**
 * Company workspace rules. Membership decides the stamp.
 * A tenant_id on the request body is never read.
 */

export type IntegrationLinkStatus = "connected" | "expired" | "not_connected";

export function workspaceNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").trim().split("@")[0]?.trim() ?? "";
  return local ? `${local} Workspace` : "Workspace";
}

/** Stamp stored on a write. Missing membership, including guests, is null. */
export function tenantStampForWrite(
  membershipTenantId: string | null | undefined,
  _body?: unknown
): string | null {
  const id = typeof membershipTenantId === "string" ? membershipTenantId.trim() : "";
  return id || null;
}

export function dealVisibleToTenant(
  rowTenantId: string | null | undefined,
  sessionTenantId: string | null | undefined
): boolean {
  const session = (sessionTenantId ?? "").trim();
  if (!session) return false;
  return rowTenantId === session;
}

export function filterRowsForTenant<T extends { tenant_id?: string | null }>(
  rows: T[],
  sessionTenantId: string | null | undefined
): T[] {
  return rows.filter((row) => dealVisibleToTenant(row.tenant_id, sessionTenantId));
}

/** Deal list requires a membership. Guest analyze does not. */
export function dealListAllowed(membershipTenantId: string | null | undefined): boolean {
  return tenantStampForWrite(membershipTenantId) != null;
}

/**
 * Analyze always proceeds. Guests and users with no membership persist no company.
 * Signed-in members stamp their company. Body tenant_id is ignored.
 */
export function analyzeWorkspaceDecision(
  userId: string | null | undefined,
  membershipTenantId: string | null | undefined,
  body?: unknown
): { proceed: boolean; tenantId: string | null } {
  if (!userId) return { proceed: true, tenantId: null };
  return { proceed: true, tenantId: tenantStampForWrite(membershipTenantId, body) };
}

export function integrationLinkStatus(
  token: { access_token?: string; expires_at?: string } | null | undefined,
  now = Date.now()
): IntegrationLinkStatus {
  if (!token?.access_token) return "not_connected";
  const exp = token.expires_at ? Date.parse(token.expires_at) : NaN;
  if (Number.isFinite(exp) && exp <= now) return "expired";
  return "connected";
}

export function rollupIntegrationStatus(
  statuses: IntegrationLinkStatus[]
): IntegrationLinkStatus {
  if (statuses.includes("connected")) return "connected";
  if (statuses.includes("expired")) return "expired";
  return "not_connected";
}

export type WorkspaceIntegrationMap = {
  google: IntegrationLinkStatus;
  hubspot: IntegrationLinkStatus;
  salesforce: IntegrationLinkStatus;
  zoom: IntegrationLinkStatus;
  teams: IntegrationLinkStatus;
};

export type WorkspaceHealthRow = {
  tenant_id: string;
  company_name: string;
  integrations: WorkspaceIntegrationMap;
};

/** Drop anything that is not company name and connection status. */
export function scrubWorkspaceHealthRow(row: WorkspaceHealthRow & Record<string, unknown>): WorkspaceHealthRow {
  return {
    tenant_id: row.tenant_id,
    company_name: row.company_name,
    integrations: {
      google: row.integrations.google,
      hubspot: row.integrations.hubspot,
      salesforce: row.integrations.salesforce,
      zoom: row.integrations.zoom,
      teams: row.integrations.teams,
    },
  };
}
