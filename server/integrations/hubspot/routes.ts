import type { Express } from "express";
import { registerOAuthConnectRoutes } from "../connectFlow.js";
import { getHubSpotConfig, isHubSpotConfigured, HUBSPOT_OAUTH_SCOPES } from "./config.js";
import { importHubSpotDealNotes, pushNoteToHubSpotDeal, searchHubSpotDeals } from "./deals.js";
import { buildHubSpotAuthorizeUrl, exchangeHubSpotCode } from "./oauth.js";
import {
  clearHubSpotTokens,
  isHubSpotConnected,
  loadHubSpotTokens,
  saveHubSpotTokens,
} from "./tokens.js";
import { upsertCrmDealLink } from "../../crmDealLinks.js";
import { getAuthUserId, requireAuthUser } from "../../requireUser.js";

export function registerHubSpotRoutes(app: Express): void {
  registerOAuthConnectRoutes(app, {
    slug: "hubspot",
    queryKey: "hubspot",
    loginProvider: "hubspot",
    notConfiguredMessage: "HubSpot OAuth not configured on server",
    getClientSecret: () => getHubSpotConfig()?.clientSecret ?? null,
    buildAuthorizeUrl: buildHubSpotAuthorizeUrl,
    exchangeCode: exchangeHubSpotCode,
    saveForUser: (userId, record) =>
      saveHubSpotTokens(userId, {
        access_token: record.access_token,
        refresh_token: record.refresh_token ?? "",
        expires_at: record.expires_at,
        account_email: record.account_email,
        hub_id: typeof record.hub_id === "string" ? record.hub_id : undefined,
        hub_domain: typeof record.hub_domain === "string" ? record.hub_domain : undefined,
        connected_at: new Date().toISOString(),
      }),
  });

  app.get("/api/integrations/hubspot/status", requireAuthUser, (req, res) => {
    const userId = getAuthUserId(req)!;
    const tokens = loadHubSpotTokens(userId);
    res.json({
      configured: isHubSpotConfigured(),
      connected: isHubSpotConnected(userId),
      account_email: tokens?.account_email ?? null,
      hub_domain: tokens?.hub_domain ?? null,
      connected_at: tokens?.connected_at ?? null,
      scopes: HUBSPOT_OAUTH_SCOPES,
      note: isHubSpotConfigured()
        ? "HubSpot connected for deal search, note import, and human-confirmed Push to HubSpot."
        : "Add HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET to enable Connect HubSpot.",
    });
  });

  app.post("/api/integrations/hubspot/disconnect", requireAuthUser, (req, res) => {
    clearHubSpotTokens(getAuthUserId(req)!);
    res.json({ ok: true });
  });

  app.post("/api/integrations/hubspot/search-deals", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isHubSpotConnected(userId)) {
      res.status(401).json({ error: "HubSpot is not connected. Connect HubSpot first." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter a deal name (at least 2 characters)." });
      return;
    }
    try {
      const deals = await searchHubSpotDeals(userId, query, 15);
      res.json({ ok: true, provider: "hubspot", query, count: deals.length, deals });
    } catch (err) {
      console.error("[hubspot-search] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "HubSpot deal search failed",
      });
    }
  });

  app.post("/api/integrations/hubspot/import-deal-notes", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isHubSpotConnected(userId)) {
      res.status(401).json({ error: "HubSpot is not connected. Connect HubSpot first." });
      return;
    }
    const dealId = String(req.body?.dealId ?? req.body?.deal_id ?? "").trim();
    if (!dealId) {
      res.status(400).json({ error: "dealId is required" });
      return;
    }
    try {
      const result = await importHubSpotDealNotes(userId, dealId);
      await upsertCrmDealLink({
        provider: "hubspot",
        externalDealId: dealId,
        accountId: result.mapped.account_id,
        salesCycleDays: result.mapped.sales_cycle_days,
        historicalCrmContext: result.mapped.historical_crm_context,
        lastInboundAt: new Date().toISOString(),
        userId,
      });
      res.json({
        ok: true,
        provider: "hubspot",
        deal: result.deal,
        note_count: result.note_count,
        account_id: result.mapped.account_id,
        sales_cycle_days: result.mapped.sales_cycle_days,
        historical_crm_context: result.mapped.historical_crm_context,
        source: result.mapped.source,
      });
    } catch (err) {
      console.error("[hubspot-import] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "HubSpot deal note import failed",
      });
    }
  });

  app.post("/api/integrations/hubspot/push-note", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isHubSpotConnected(userId)) {
      res.status(401).json({ error: "HubSpot is not connected. Connect HubSpot first." });
      return;
    }
    const dealId = String(req.body?.dealId ?? req.body?.deal_id ?? "").trim();
    const noteBody = String(req.body?.noteBody ?? req.body?.note_body ?? "").trim();
    const postMortemId = String(req.body?.postMortemId ?? req.body?.post_mortem_id ?? "").trim();
    if (!dealId) {
      res.status(400).json({ error: "dealId is required" });
      return;
    }
    if (!noteBody) {
      res.status(400).json({ error: "noteBody is required" });
      return;
    }
    try {
      const pushed = await pushNoteToHubSpotDeal(userId, dealId, noteBody);
      const linkId = await upsertCrmDealLink({
        provider: "hubspot",
        externalDealId: dealId,
        postMortemId: postMortemId || null,
        userId,
        lastOutboundAt: new Date().toISOString(),
      });
      res.json({
        ok: true,
        provider: "hubspot",
        deal_id: dealId,
        note_id: pushed.noteId,
        link_id: linkId,
      });
    } catch (err) {
      console.error("[hubspot-push] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "HubSpot push failed",
      });
    }
  });
}
