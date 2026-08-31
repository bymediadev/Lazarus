import type { Express } from "express";
import { registerOAuthConnectRoutes } from "../connectFlow.js";
import { getGoogleMeetConfig, isGoogleMeetConfigured } from "./config.js";
import {
  fetchGmailThreadsByQuery,
  formatImportedEmailsAsThread,
  fetchRecentGmailMessages,
} from "./gmail.js";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode } from "./oauth.js";
import {
  clearGoogleTokens,
  ensureGoogleTokensHydrated,
  isGoogleConnected,
  loadGoogleTokens,
  saveGoogleTokens,
} from "./tokens.js";
import { getAuthUserId, requireAuthUser } from "../../requireUser.js";
import { consumeRateLimit, clientRateKey } from "../../rateLimit.js";
import {
  createMeetLiveSession,
  getLiveSession,
  publishToSession,
  sessionSecretOk,
  subscribeLiveSession,
} from "../zoom/transcriptBus.js";

export function registerGoogleMeetRoutes(app: Express): void {
  registerOAuthConnectRoutes(app, {
    slug: "google",
    queryKey: "google",
    loginProvider: "google",
    notConfiguredMessage: "Google Meet OAuth not configured on server",
    getClientSecret: () => getGoogleMeetConfig()?.clientSecret ?? null,
    buildAuthorizeUrl: buildGoogleAuthorizeUrl,
    exchangeCode: exchangeGoogleCode,
    saveForUser: (userId, record) =>
      saveGoogleTokens(userId, {
        access_token: record.access_token,
        refresh_token: record.refresh_token ?? "",
        expires_at: record.expires_at,
        account_email: record.account_email,
        connected_at: new Date().toISOString(),
      }),
  });

  app.get("/api/integrations/google/status", requireAuthUser, async (req, res) => {
    await ensureGoogleTokensHydrated();
    const userId = getAuthUserId(req)!;
    const tokens = loadGoogleTokens(userId);
    res.json({
      configured: isGoogleMeetConfigured(),
      connected: isGoogleConnected(userId),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      live_captions: true,
      note: isGoogleMeetConfigured()
        ? "Connect Google for Gmail search. Live Meet captions use the Lazarus Chrome extension — turn on Captions in Meet, then Start."
        : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Gmail Connect. Live Meet captions still work via the Chrome extension.",
    });
  });

  app.post("/api/integrations/google/disconnect", requireAuthUser, async (req, res) => {
    await clearGoogleTokens(getAuthUserId(req)!);
    res.json({ ok: true });
  });

  app.post("/api/integrations/google/live-session/start", requireAuthUser, (req, res) => {
    const created = createMeetLiveSession(getAuthUserId(req)!);
    res.json({ ...created, platform: "meet" });
  });

  app.post("/api/integrations/google/live-captions", (req, res) => {
    if (consumeRateLimit(clientRateKey(req, "meet-captions"), 60_000, 240)) {
      res.status(429).json({ error: "Too many caption posts" });
      return;
    }
    const sessionId = String(req.body?.sessionId ?? "").trim();
    const sessionSecret = String(req.body?.sessionSecret ?? "").trim();
    const dialogue = String(req.body?.dialogue ?? req.body?.text ?? "").trim();
    const speaker = String(req.body?.speaker ?? "Speaker").trim() || "Speaker";
    if (!sessionId || !sessionSecret || !dialogue) {
      res.status(400).json({ error: "sessionId, sessionSecret, and dialogue are required" });
      return;
    }
    const session = getLiveSession(sessionId);
    if (!session || session.platform !== "meet" || !sessionSecretOk(session, sessionSecret)) {
      res.status(404).json({ error: "Live session not found or expired" });
      return;
    }
    const timestamp = String(req.body?.timestamp ?? "").trim();
    const published = publishToSession(sessionId, {
      speaker,
      dialogue,
      timestamp: timestamp || new Date().toISOString().slice(11, 16),
      source: "meet_captions",
    });
    res.json({ ok: true, accepted: published });
  });

  app.get("/api/integrations/google/live-transcript/stream", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "");
    const sessionSecret = String(req.query.sessionSecret ?? "");
    const session = getLiveSession(sessionId);
    if (!session || session.platform !== "meet" || !sessionSecretOk(session, sessionSecret)) {
      res.status(404).json({ error: "Live session not found or expired" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const unsubscribe = subscribeLiveSession(sessionId, (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });

    if (!unsubscribe) {
      res.status(404).end();
      return;
    }

    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 25_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.post("/api/integrations/google/import-emails", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    await ensureGoogleTokensHydrated();
    if (!isGoogleConnected(userId)) {
      res.status(401).json({ error: "Google is not connected. Connect Gmail first." });
      return;
    }
    try {
      const limitRaw = Number(req.body?.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;
      const messages = await fetchRecentGmailMessages(userId, limit);
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

  app.post("/api/integrations/google/search-emails", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    await ensureGoogleTokensHydrated();
    if (!isGoogleConnected(userId)) {
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
        userId,
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
