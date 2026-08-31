import type { Express } from "express";
import { registerOAuthConnectRoutes } from "../connectFlow.js";
import { getSalesforceConfig, isSalesforceConfigured, SALESFORCE_OAUTH_SCOPES } from "./config.js";
import {
  importSalesforceOpportunityNotes,
  pushNoteToSalesforceOpportunity,
  searchSalesforceOpportunities,
} from "./deals.js";
import { buildSalesforceAuthorizeUrl, exchangeSalesforceCode } from "./oauth.js";
import {
  clearSalesforceTokens,
  isSalesforceConnected,
  loadSalesforceTokens,
  saveSalesforceTokens,
} from "./tokens.js";
import { upsertCrmDealLink, getCrmDealLinkByExternalId, updateCrmDealLinkContext } from "../../crmDealLinks.js";
import { getAuthUserId, requireAuthUser } from "../../requireUser.js";
import { secretsEqual } from "../../cryptoSecrets.js";

export function registerSalesforceRoutes(app: Express): void {
  registerOAuthConnectRoutes(app, {
    slug: "salesforce",
    queryKey: "salesforce",
    loginProvider: "salesforce",
    notConfiguredMessage: "Salesforce OAuth not configured on server",
    getClientSecret: () => getSalesforceConfig()?.clientSecret ?? null,
    buildAuthorizeUrl: buildSalesforceAuthorizeUrl,
    exchangeCode: exchangeSalesforceCode,
    saveForUser: (userId, record) =>
      saveSalesforceTokens(userId, {
        access_token: record.access_token,
        refresh_token: record.refresh_token ?? "",
        expires_at: record.expires_at,
        instance_url: String(record.instance_url ?? ""),
        account_email: record.account_email,
        connected_at: new Date().toISOString(),
      }),
  });

  app.get("/api/integrations/salesforce/status", requireAuthUser, (req, res) => {
    const userId = getAuthUserId(req)!;
    const tokens = loadSalesforceTokens(userId);
    res.json({
      configured: isSalesforceConfigured(),
      connected: isSalesforceConnected(userId),
      account_email: tokens?.account_email ?? null,
      instance_url: tokens?.instance_url ?? null,
      connected_at: tokens?.connected_at ?? null,
      scopes: SALESFORCE_OAUTH_SCOPES,
      note: isSalesforceConfigured()
        ? "Salesforce connected for opportunity search, note import, and human-confirmed Push."
        : "Add SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET to enable Connect Salesforce.",
    });
  });

  app.post("/api/integrations/salesforce/disconnect", requireAuthUser, (req, res) => {
    clearSalesforceTokens(getAuthUserId(req)!);
    res.json({ ok: true });
  });

  app.post("/api/integrations/salesforce/search-opportunities", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isSalesforceConnected(userId)) {
      res.status(401).json({ error: "Salesforce is not connected." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter an opportunity name (at least 2 characters)." });
      return;
    }
    try {
      const opportunities = await searchSalesforceOpportunities(userId, query, 15);
      res.json({
        ok: true,
        provider: "salesforce",
        query,
        count: opportunities.length,
        opportunities,
      });
    } catch (err) {
      console.error("[salesforce-search]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Salesforce search failed",
      });
    }
  });

  app.post("/api/integrations/salesforce/import-opportunity", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isSalesforceConnected(userId)) {
      res.status(401).json({ error: "Salesforce is not connected." });
      return;
    }
    const opportunityId = String(
      req.body?.opportunityId ?? req.body?.opportunity_id ?? req.body?.dealId ?? ""
    ).trim();
    if (!opportunityId) {
      res.status(400).json({ error: "opportunityId is required" });
      return;
    }
    try {
      const result = await importSalesforceOpportunityNotes(userId, opportunityId);
      await upsertCrmDealLink({
        provider: "salesforce",
        externalDealId: opportunityId,
        accountId: result.mapped.account_id,
        salesCycleDays: result.mapped.sales_cycle_days,
        historicalCrmContext: result.mapped.historical_crm_context,
        lastInboundAt: new Date().toISOString(),
        userId,
      });
      res.json({
        ok: true,
        provider: "salesforce",
        opportunity: result.opportunity,
        note_count: result.note_count,
        account_id: result.mapped.account_id,
        sales_cycle_days: result.mapped.sales_cycle_days,
        historical_crm_context: result.mapped.historical_crm_context,
        source: result.mapped.source,
        deal_id: result.mapped.deal_id,
      });
    } catch (err) {
      console.error("[salesforce-import]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Salesforce import failed",
      });
    }
  });

  app.post("/api/integrations/salesforce/push-note", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isSalesforceConnected(userId)) {
      res.status(401).json({ error: "Salesforce is not connected." });
      return;
    }
    const opportunityId = String(
      req.body?.opportunityId ?? req.body?.dealId ?? req.body?.deal_id ?? ""
    ).trim();
    const noteBody = String(req.body?.noteBody ?? req.body?.note_body ?? "").trim();
    const postMortemId = String(req.body?.postMortemId ?? req.body?.post_mortem_id ?? "").trim();
    if (!opportunityId) {
      res.status(400).json({ error: "opportunityId is required" });
      return;
    }
    if (!noteBody) {
      res.status(400).json({ error: "noteBody is required" });
      return;
    }
    try {
      const pushed = await pushNoteToSalesforceOpportunity(userId, opportunityId, noteBody);
      const linkId = await upsertCrmDealLink({
        provider: "salesforce",
        externalDealId: opportunityId,
        postMortemId: postMortemId || null,
        userId,
        lastOutboundAt: new Date().toISOString(),
      });
      res.json({
        ok: true,
        provider: "salesforce",
        opportunity_id: opportunityId,
        feed_item_id: pushed.feedItemId,
        link_id: linkId,
      });
    } catch (err) {
      console.error("[salesforce-push]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Salesforce push failed",
      });
    }
  });

  app.post("/api/webhooks/salesforce", async (req, res) => {
    const expected = (process.env.SALESFORCE_WEBHOOK_SECRET ?? "").trim();
    const provided =
      (req.headers["x-webhook-secret"] as string | undefined)?.trim() ??
      String(req.query.secret ?? "").trim();
    if (!expected || !secretsEqual(provided, expected)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const opportunityId = String(
        req.body?.opportunityId ?? req.body?.Id ?? req.body?.deal_id ?? ""
      ).trim();
      if (!opportunityId) {
        res.status(400).json({ error: "opportunityId required" });
        return;
      }
      const existing = await getCrmDealLinkByExternalId("salesforce", opportunityId);
      if (!existing?.user_id) {
        res.status(404).json({ error: "No owner-linked Salesforce deal for this id" });
        return;
      }
      if (!isSalesforceConnected(existing.user_id)) {
        res.status(401).json({ error: "Owner Salesforce connection is missing" });
        return;
      }
      const imported = await importSalesforceOpportunityNotes(existing.user_id, opportunityId);
      await updateCrmDealLinkContext(existing.id, {
        historical_crm_context: imported.mapped.historical_crm_context,
        sales_cycle_days: imported.mapped.sales_cycle_days,
        last_inbound_at: new Date().toISOString(),
      });
      res.json({ ok: true, mapped: imported.mapped, link_id: existing.id, synced: true });
    } catch (err) {
      console.error("[salesforce-webhook]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Salesforce webhook failed",
      });
    }
  });
}
