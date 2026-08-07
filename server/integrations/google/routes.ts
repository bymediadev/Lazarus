import type { Express } from "express";
import {
  createSignedOAuthState,
  resolveFrontendOrigin,
  verifySignedOAuthState,
} from "../oauthShared.js";
import { getGoogleMeetConfig, isGoogleMeetConfigured } from "./config.js";
import {
  fetchGmailThreadsByQuery,
  formatImportedEmailsAsThread,
  fetchRecentGmailMessages,
} from "./gmail.js";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode } from "./oauth.js";
import { clearGoogleTokens, isGoogleConnected, loadGoogleTokens } from "./tokens.js";

function redirectLoginResult(
  frontendOrigin: string,
  outcome: "connected" | "error",
  reason?: string
): string {
  const q = new URLSearchParams({ google: outcome });
  if (reason) q.set("reason", reason);
  return `${frontendOrigin}/?${q.toString()}`;
}

export function registerGoogleMeetRoutes(app: Express): void {
  app.get("/api/integrations/google/status", (_req, res) => {
    const tokens = loadGoogleTokens();
    res.json({
      configured: isGoogleMeetConfigured(),
      connected: isGoogleConnected(),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      note: isGoogleMeetConfigured()
        ? "Google connected for Meet/Workspace and Gmail thread search. Ask for a company or deal — Lazarus Deal Recovery expands matching threads into the evidence package."
        : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Connect Google / Gmail.",
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
      res.redirect(redirectLoginResult(frontendOrigin, "error", "invalid_state"));
      return;
    }

    try {
      await exchangeGoogleCode(code);
      res.redirect(redirectLoginResult(frontendOrigin, "connected"));
    } catch (err) {
      console.error("[google-oauth] callback error:", err);
      const reason =
        err instanceof Error && /TLS|certificate/i.test(err.message)
          ? "tls_certificate"
          : "token_exchange";
      res.redirect(redirectLoginResult(frontendOrigin, "error", reason));
    }
  });

  app.post("/api/integrations/google/disconnect", (_req, res) => {
    clearGoogleTokens();
    res.json({ ok: true });
  });

  app.post("/api/integrations/google/import-emails", async (req, res) => {
    if (!isGoogleConnected()) {
      res.status(401).json({ error: "Google is not connected. Connect Gmail first." });
      return;
    }
    try {
      const limitRaw = Number(req.body?.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;
      const messages = await fetchRecentGmailMessages(limit);
      const thread = formatImportedEmailsAsThread(messages);
      res.json({
        ok: true,
        provider: "gmail",
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
      console.error("[gmail-import] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Gmail import failed",
      });
    }
  });

  app.post("/api/integrations/google/search-emails", async (req, res) => {
    if (!isGoogleConnected()) {
      res.status(401).json({ error: "Google is not connected. Connect Gmail first." });
      return;
    }
    const query = String(req.body?.query ?? "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Enter a company, domain, person, or topic." });
      return;
    }
    try {
      const result = await fetchGmailThreadsByQuery(query, {
        maxThreads: 5,
        maxMessages: 40,
      });
      res.json({
        ok: true,
        provider: "gmail",
        query,
        gmail_query: result.gmailQuery,
        thread_count: result.threadCount,
        count: result.messages.length,
        thread: formatImportedEmailsAsThread(result.messages),
        messages: result.messages.map((m) => ({
          id: m.id,
          threadId: m.threadId,
          subject: m.subject,
          from: m.from,
          date: m.date,
          snippet: m.snippet,
        })),
      });
    } catch (err) {
      console.error("[gmail-search] error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Gmail search failed",
      });
    }
  });
}
