import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
import { getTeamsConfig, isTeamsConfigured } from "./config.js";
import { buildTeamsAuthorizeUrl, exchangeTeamsCode } from "./oauth.js";
import { clearTeamsTokens, isTeamsConnected, loadTeamsTokens } from "./tokens.js";

export function registerTeamsRoutes(app: Express): void {
  app.get("/api/integrations/teams/status", (_req, res) => {
    const tokens = loadTeamsTokens();
    res.json({
      configured: isTeamsConfigured(),
      connected: isTeamsConnected(),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      note: isTeamsConfigured()
        ? "Teams/Graph connected. Online meeting transcript pull comes next — mic/paste feeds live triage today."
        : "Add TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET (Azure app) to enable Connect Teams.",
    });
  });

  app.get("/api/integrations/teams/connect", (_req, res) => {
    const cfg = getTeamsConfig();
    if (!cfg) {
      res.status(503).json({ error: "Teams OAuth not configured on server" });
      return;
    }
    try {
      const state = createSignedOAuthState(cfg.clientSecret);
      res.redirect(buildTeamsAuthorizeUrl(state));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start Teams OAuth",
      });
    }
  });

  app.get("/api/integrations/teams/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();
    const cfg = getTeamsConfig();

    if (!code || !verifySignedOAuthState(state, cfg?.clientSecret ?? "")) {
      res.redirect(`${frontendOrigin}/?teams=error&reason=invalid_state`);
      return;
    }

    try {
      await exchangeTeamsCode(code);
      res.redirect(`${frontendOrigin}/?teams=connected`);
    } catch (err) {
      console.error("[teams-oauth] callback error:", err);
      res.redirect(`${frontendOrigin}/?teams=error&reason=token_exchange`);
    }
  });

  app.post("/api/integrations/teams/disconnect", (_req, res) => {
    clearTeamsTokens();
    res.json({ ok: true });
  });
}
