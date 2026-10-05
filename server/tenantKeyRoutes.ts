import type { Express } from "express";
import { getAuthUserId, requireAuthUser } from "./requireUser.js";
import { tenantIdForUser } from "./tenantMembership.js";
import { issueTenantApiKey, tenantForKeyIssue } from "./tenantApiKey.js";

export function registerTenantKeyRoutes(app: Express): void {
  app.post("/api/tenant/generate-key", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const membershipTenantId = await tenantIdForUser(userId);
    const tenantId = tenantForKeyIssue(membershipTenantId, req.body);
    if (!tenantId) {
      res.status(403).json({ error: "You need a company workspace before a key can be created." });
      return;
    }
    const created = await issueTenantApiKey(tenantId, req.body);
    if (!created.ok) {
      res.status(created.status).json({ error: created.error });
      return;
    }
    res.json({
      rawKey: created.raw,
      prefix: created.prefix,
      message: "Copy this key now. It will not be shown again.",
    });
  });
}
