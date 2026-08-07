import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
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
} from "./tokens.js";
import { upsertCrmDealLink, getCrmDealLinkByExternalId, updateCrmDealLinkContext } from "../../crmDealLinks.js";
import { optionalAuthUserId } from "../../authMiddleware.js";

export function registerSalesforceRoutes(app: Express): void {
  app.get("/api/integrations/salesforce/status", (_req, res) => {
    const tokens = loadSalesforceTokens();
    res.json({
      configured: isSalesforceConfigured(),
      connected: isSalesforceConnected(),
      account_email: tokens?.account_email ?? null,
      instance_url: tokens?.instance_url ?? null,
      connected_at: tokens?.connected_at ?? null,
      scopes: SALESFORCE_OAUTH_SCOPES,
      note: isSalesforceConfigured()
        ? "Salesforce connected for opportunity search, note import, and human-confirmed Push."
        : "Add SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET to enable Connect Salesforce.",
    });
  });

  app.get("/api/integrations/salesforce/connect", (_req, res) => {
    const cfg = getSalesforceConfig();
    if (!cfg) {
      res.status(503).json({ error: "Salesforce OAuth not configured on server" });
      return;
    }
    try {
      const state = createSignedOAuthState(cfg.clientSecret);
      res.redirect(buildSalesforceAuthorizeUrl(state));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start Salesforce OAuth",
      });
    }
  });

  app.get("/api/integrations/salesforce/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();
    const cfg = getSalesforceConfig();

    if (!code || !verifySignedOAuthState(state, cfg?.clientSecret ?? "")) {
      res.redirect(`${frontendOrigin}/?salesforce=error&reason=invalid_state`);
      return;
    }

    try {
      await exchangeSalesforceCode(code);
      res.redirect(`${frontendOrigin}/?salesforce=connected`);
    } catch (err) {
      console.error("[salesforce-oauth] callback error:", err);
      res.redirect(`${frontendOrigin}/?salesforce=error&reason=token_exchange`);
    }
  });

  app.post("/api/integrations/salesforce/disconnect", (_req, res) => {
    clearSalesforceTokens();
    res.json({ ok: true });
  });

  app.post("/api/integrations/salesforce/search-opportunities", async (req, res) => {
    if (!isSalesforceConnected()) {
      res.status(401).json({ error: "Salesforce is not connected." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter an opportunity name (at least 2 characters)." });
      return;
    }
    try {
      const opportunities = await searchSalesforceOpportunities(query, 15);
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

  app.post("/api/integrations/salesforce/import-opportunity", async (req, res) => {
    if (!isSalesforceConnected()) {
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
      const result = await importSalesforceOpportunityNotes(opportunityId);
      await upsertCrmDealLink({
        provider: "salesforce",
        externalDealId: opportunityId,
        accountId: result.mapped.account_id,
        salesCycleDays: result.mapped.sales_cycle_days,
        historicalCrmContext: result.mapped.historical_crm_context,
        lastInboundAt: new Date().toISOString(),
        userId: await optionalAuthUserId(req),
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

  app.post("/api/integrations/salesforce/push-note", async (req, res) => {
    if (!isSalesforceConnected()) {
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
      const pushed = await pushNoteToSalesforceOpportunity(opportunityId, noteBody);
      const linkId = await upsertCrmDealLink({
        provider: "salesforce",
        externalDealId: opportunityId,
        postMortemId: postMortemId || null,
        userId: await optionalAuthUserId(req),
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

  /** Salesforce outbound message / CDC-style webhook → upsert deal link context. */
  app.post("/api/webhooks/salesforce", async (req, res) => {
    const expected = (process.env.SALESFORCE_WEBHOOK_SECRET ?? "").trim();
    const provided =
      (req.headers["x-webhook-secret"] as string | undefined)?.trim() ??
      String(req.query.secret ?? "").trim();
    if (expected && provided !== expected) {
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
      const imported = await importSalesforceOpportunityNotes(opportunityId);
      const existing = await getCrmDealLinkByExternalId("salesforce", opportunityId);
      let linkId: string | null = null;
      if (existing) {
        await updateCrmDealLinkContext(existing.id, {
          historical_crm_context: imported.mapped.historical_crm_context,
          sales_cycle_days: imported.mapped.sales_cycle_days,
          last_inbound_at: new Date().toISOString(),
        });
        linkId = existing.id;
      } else {
        linkId = await upsertCrmDealLink({
          provider: "salesforce",
          externalDealId: opportunityId,
          accountId: imported.mapped.account_id,
          salesCycleDays: imported.mapped.sales_cycle_days,
          historicalCrmContext: imported.mapped.historical_crm_context,
          lastInboundAt: new Date().toISOString(),
        });
      }
      res.json({ ok: true, mapped: imported.mapped, link_id: linkId, synced: !!linkId });
    } catch (err) {
      console.error("[salesforce-webhook]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Salesforce webhook failed",
      });
    }
  });
}
