import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
import { getTeamsConfig, isTeamsConfigured } from "./config.js";
import { buildTeamsAuthorizeUrl, exchangeTeamsCode } from "./oauth.js";
import {
  fetchOutlookThreadsByQuery,
  formatOutlookMessagesAsThread,
  fetchRecentOutlookMessages,
} from "./outlook.js";
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
        ? "Teams/Graph connected with Outlook thread search. Ask for a company or deal — Lazarus expands matching conversations into the evidence package."
        : "Add TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET (Azure app) to enable Connect Teams / Outlook.",
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

  app.post("/api/integrations/teams/import-emails", async (req, res) => {
    if (!isTeamsConnected()) {
      res.status(401).json({ error: "Microsoft is not connected. Connect Outlook first." });
      return;
    }
    try {
      const limitRaw = Number(req.body?.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;
      const messages = await fetchRecentOutlookMessages(limit);
      const thread = formatOutlookMessagesAsThread(messages);
      res.json({
        ok: true,
        provider: "outlook",
        count: messages.length,
        thread,
        messages: messages.map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          date: m.date,
          snippet: m.snippet,
        })),
      });
    } catch (err) {
      console.error("[outlook-import] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Outlook import failed",
      });
    }
  });

  app.post("/api/integrations/teams/search-emails", async (req, res) => {
    if (!isTeamsConnected()) {
      res.status(401).json({ error: "Microsoft is not connected. Connect Outlook first." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter a company, domain, person, or topic." });
      return;
    }
    try {
      const result = await fetchOutlookThreadsByQuery(query, {
        maxThreads: 5,
        maxMessages: 40,
      });
      res.json({
        ok: true,
        provider: "outlook",
        query,
        thread_count: result.threadCount,
        count: result.messages.length,
        thread: formatOutlookMessagesAsThread(result.messages),
        messages: result.messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          subject: m.subject,
          from: m.from,
          date: m.date,
          snippet: m.snippet,
        })),
      });
    } catch (err) {
      console.error("[outlook-search] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Outlook search failed",
      });
    }
  });
}
