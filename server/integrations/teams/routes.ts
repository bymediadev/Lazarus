import type { Express } from "express";
import { registerOAuthConnectRoutes } from "../connectFlow.js";
import { getTeamsConfig, isTeamsConfigured } from "./config.js";
import {
  fetchOutlookThreadsByQuery,
  formatOutlookMessagesAsThread,
  fetchRecentOutlookMessages,
} from "./outlook.js";
import { buildTeamsAuthorizeUrl, exchangeTeamsCode } from "./oauth.js";
import {
  clearTeamsTokens,
  isTeamsConnected,
  loadTeamsTokens,
  saveTeamsTokens,
} from "./tokens.js";
import { getAuthUserId, requireAuthUser } from "../../requireUser.js";

export function registerTeamsRoutes(app: Express): void {
  registerOAuthConnectRoutes(app, {
    slug: "teams",
    queryKey: "teams",
    notConfiguredMessage: "Teams OAuth not configured on server",
    getClientSecret: () => getTeamsConfig()?.clientSecret ?? null,
    buildAuthorizeUrl: buildTeamsAuthorizeUrl,
    exchangeCode: exchangeTeamsCode,
    saveForUser: (userId, record) =>
      saveTeamsTokens(userId, {
        access_token: record.access_token,
        refresh_token: record.refresh_token ?? "",
        expires_at: record.expires_at,
        account_email: record.account_email,
        connected_at: new Date().toISOString(),
      }),
  });

  app.get("/api/integrations/teams/status", requireAuthUser, (req, res) => {
    const userId = getAuthUserId(req)!;
    const tokens = loadTeamsTokens(userId);
    res.json({
      configured: isTeamsConfigured(),
      connected: isTeamsConnected(userId),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      note: isTeamsConfigured()
        ? "Teams/Graph connected with Outlook thread search. Ask for a company or deal — Lazarus Deal Recovery expands matching conversations into the evidence package."
        : "Add TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET (Azure app) to enable Connect Teams / Outlook.",
    });
  });

  app.post("/api/integrations/teams/disconnect", requireAuthUser, (req, res) => {
    clearTeamsTokens(getAuthUserId(req)!);
    res.json({ ok: true });
  });

  app.post("/api/integrations/teams/import-emails", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isTeamsConnected(userId)) {
      res.status(401).json({ error: "Microsoft is not connected. Connect Outlook first." });
      return;
    }
    try {
      const limitRaw = Number(req.body?.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;
      const messages = await fetchRecentOutlookMessages(userId, limit);
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

  app.post("/api/integrations/teams/search-emails", requireAuthUser, async (req, res) => {
    const userId = getAuthUserId(req)!;
    if (!isTeamsConnected(userId)) {
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
        userId,
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
