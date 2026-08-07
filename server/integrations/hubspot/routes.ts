import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
import { getHubSpotConfig, isHubSpotConfigured, HUBSPOT_OAUTH_SCOPES } from "./config.js";
import { importHubSpotDealNotes, pushNoteToHubSpotDeal, searchHubSpotDeals } from "./deals.js";
import { buildHubSpotAuthorizeUrl, exchangeHubSpotCode } from "./oauth.js";
import { clearHubSpotTokens, isHubSpotConnected, loadHubSpotTokens } from "./tokens.js";
import { upsertCrmDealLink } from "../../crmDealLinks.js";
import { optionalAuthUserId } from "../../authMiddleware.js";

export function registerHubSpotRoutes(app: Express): void {
  app.get("/api/integrations/hubspot/status", (_req, res) => {
    const tokens = loadHubSpotTokens();
    res.json({
      configured: isHubSpotConfigured(),
      connected: isHubSpotConnected(),
      account_email: tokens?.account_email ?? null,
      hub_domain: tokens?.hub_domain ?? null,
      connected_at: tokens?.connected_at ?? null,
      scopes: HUBSPOT_OAUTH_SCOPES,
      note: isHubSpotConfigured()
        ? "HubSpot connected for deal search, note import, and human-confirmed Push to HubSpot."
        : "Add HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET to enable Connect HubSpot.",
    });
  });

  app.get("/api/integrations/hubspot/connect", (_req, res) => {
    const cfg = getHubSpotConfig();
    if (!cfg) {
      res.status(503).json({ error: "HubSpot OAuth not configured on server" });
      return;
    }
    try {
      const state = createSignedOAuthState(cfg.clientSecret);
      res.redirect(buildHubSpotAuthorizeUrl(state));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start HubSpot OAuth",
      });
    }
  });

  app.get("/api/integrations/hubspot/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();
    const cfg = getHubSpotConfig();

    if (!code || !verifySignedOAuthState(state, cfg?.clientSecret ?? "")) {
      res.redirect(`${frontendOrigin}/?hubspot=error&reason=invalid_state`);
      return;
    }

    try {
      await exchangeHubSpotCode(code);
      res.redirect(`${frontendOrigin}/?hubspot=connected`);
    } catch (err) {
      console.error("[hubspot-oauth] callback error:", err);
      res.redirect(`${frontendOrigin}/?hubspot=error&reason=token_exchange`);
    }
  });

  app.post("/api/integrations/hubspot/disconnect", (_req, res) => {
    clearHubSpotTokens();
    res.json({ ok: true });
  });

  app.post("/api/integrations/hubspot/search-deals", async (req, res) => {
    if (!isHubSpotConnected()) {
      res.status(401).json({ error: "HubSpot is not connected. Connect HubSpot first." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter a deal name (at least 2 characters)." });
      return;
    }
    try {
      const deals = await searchHubSpotDeals(query, 15);
      res.json({
        ok: true,
        provider: "hubspot",
        query,
        count: deals.length,
        deals,
      });
    } catch (err) {
      console.error("[hubspot-search] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "HubSpot deal search failed",
      });
    }
  });

  app.post("/api/integrations/hubspot/import-deal-notes", async (req, res) => {
    if (!isHubSpotConnected()) {
      res.status(401).json({ error: "HubSpot is not connected. Connect HubSpot first." });
      return;
    }
    const dealId = String(req.body?.dealId ?? req.body?.deal_id ?? "").trim();
    if (!dealId) {
      res.status(400).json({ error: "dealId is required" });
      return;
    }
    try {
      const result = await importHubSpotDealNotes(dealId);
      await upsertCrmDealLink({
        provider: "hubspot",
        externalDealId: dealId,
        accountId: result.mapped.account_id,
        salesCycleDays: result.mapped.sales_cycle_days,
        historicalCrmContext: result.mapped.historical_crm_context,
        lastInboundAt: new Date().toISOString(),
        userId: await optionalAuthUserId(req),
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

  /** Human-confirmed Lazarus → HubSpot note write + deal link upsert. */
  app.post("/api/integrations/hubspot/push-note", async (req, res) => {
    if (!isHubSpotConnected()) {
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
      const pushed = await pushNoteToHubSpotDeal(dealId, noteBody);
      const userId = await optionalAuthUserId(req);
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
