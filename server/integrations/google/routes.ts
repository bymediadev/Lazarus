import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
import { getGoogleMeetConfig, isGoogleMeetConfigured } from "./config.js";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode } from "./oauth.js";
import { clearGoogleTokens, isGoogleConnected, loadGoogleTokens } from "./tokens.js";

export function registerGoogleMeetRoutes(app: Express): void {
  app.get("/api/integrations/google/status", (_req, res) => {
    const tokens = loadGoogleTokens();
    res.json({
      configured: isGoogleMeetConfigured(),
      connected: isGoogleConnected(),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      note: isGoogleMeetConfigured()
        ? "Google connected for Meet/Workspace. Live captions auto-ingest comes next — mic/paste feeds live triage today."
        : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Connect Google.",
    });
  });

  app.get("/api/integrations/google/connect", (_req, res) => {
    const cfg = getGoogleMeetConfig();
    if (!cfg) {
      res.status(503).json({ error: "Google Meet OAuth not configured on server" });
      return;
    }
    try {
      const state = createSignedOAuthState(cfg.clientSecret);
      res.redirect(buildGoogleAuthorizeUrl(state));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start Google OAuth",
      });
    }
  });

  app.get("/api/integrations/google/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();
    const cfg = getGoogleMeetConfig();

    if (!code || !verifySignedOAuthState(state, cfg?.clientSecret ?? "")) {
      res.redirect(`${frontendOrigin}/?google=error&reason=invalid_state`);
      return;
    }

    try {
      await exchangeGoogleCode(code);
      res.redirect(`${frontendOrigin}/?google=connected`);
    } catch (err) {
      console.error("[google-oauth] callback error:", err);
      res.redirect(`${frontendOrigin}/?google=error&reason=token_exchange`);
    }
  });

  app.post("/api/integrations/google/disconnect", (_req, res) => {
    clearGoogleTokens();
    res.json({ ok: true });
  });
}
