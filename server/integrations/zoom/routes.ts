import type { Express, Request, Response } from "express";
import { getZoomConfig, isZoomConfigured } from "./config.js";
import { buildZoomAuthorizeUrl, exchangeZoomCode } from "./oauth.js";
import {
  clearZoomTokens,
  findZoomUserIdByAccount,
  hydrateZoomTokens,
  isZoomConnected,
  loadZoomTokens,
  saveZoomTokens,
} from "./tokens.js";
import {
  consumeStreamTicket,
  createZoomLiveSession,
  dropLiveSessionsForUser,
  getLiveSession,
  issueStreamTicket,
  sessionSecretOk,
  subscribeLiveSession,
} from "./transcriptBus.js";
import {
  handleZoomRtmsStarted,
  handleZoomRtmsStopped,
  rtmsPlatformNote,
  verifyZoomWebhookSignature,
  zoomWebhookValidationResponse,
} from "./rtmsHub.js";
import { registerOAuthConnectRoutes } from "../connectFlow.js";
import { getAuthUserId, requireAuthUser } from "../../requireUser.js";
import { serviceRoleClient } from "../../founderAuth.js";

const ZOOM_WEBHOOK_MAX_BYTES = 1_048_576;

/** Register before express.json() — Zoom HMAC requires raw body. */
export function registerZoomWebhook(app: Express): void {
  app.post("/api/webhooks/zoom", (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > ZOOM_WEBHOOK_MAX_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        res.status(413).json({ error: "Zoom webhook body is too large" });
        return;
      }
      void handleZoomWebhook(req, res, Buffer.concat(chunks).toString("utf8"));
    });
  });
}

async function handleZoomWebhook(req: Request, res: Response, rawBody: string): Promise<void> {
  const cfg = getZoomConfig();
  if (!cfg?.webhookSecret) {
    res.status(401).json({ error: "Zoom webhook secret is not configured" });
    return;
  }
  const signature = req.headers["x-zm-signature"] as string | undefined;
  const timestamp = req.headers["x-zm-request-timestamp"] as string | undefined;
  const valid = verifyZoomWebhookSignature(rawBody, signature, timestamp, cfg.webhookSecret);
  if (!valid) {
    res.status(401).json({ error: "Invalid Zoom webhook signature" });
    return;
  }

  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody) as { event?: string; payload?: Record<string, unknown> };
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const event = String(body.event ?? "");
  const payload = body.payload ?? {};

  if (event === "endpoint.url_validation") {
    const plainToken = String(payload.plainToken ?? "");
    if (!plainToken) {
      res.status(400).json({ error: "Missing validation token" });
      return;
    }
    res.json(zoomWebhookValidationResponse(plainToken, cfg.webhookSecret));
    return;
  }

  if (event === "meeting.rtms_started") {
    await handleZoomRtmsStarted(payload);
  } else if (event === "meeting.rtms_stopped") {
    handleZoomRtmsStopped(payload);
  } else if (event === "app_deauthorized") {
    await handleZoomDeauthorized(payload);
  }

  res.json({ ok: true });
}

async function handleZoomDeauthorized(payload: Record<string, unknown>): Promise<void> {
  await hydrateZoomTokens();
  const accountId = String(payload.account_id ?? "").trim();
  const userId = findZoomUserIdByAccount(undefined, accountId);
  if (!userId) return;
  clearZoomTokens(userId);
  dropLiveSessionsForUser(userId);
  const sb = serviceRoleClient();
  if (sb) {
    await sb.from("live_meeting_consent").delete().eq("user_id", userId).eq("platform", "zoom");
  }
}

export function registerZoomRoutes(app: Express): void {
  registerOAuthConnectRoutes(app, {
    slug: "zoom",
    queryKey: "zoom",
    notConfiguredMessage: "Zoom OAuth not configured on server",
    getClientSecret: () => getZoomConfig()?.clientSecret ?? null,
    buildAuthorizeUrl: buildZoomAuthorizeUrl,
    exchangeCode: exchangeZoomCode,
    saveForUser: (userId, record) =>
      saveZoomTokens(userId, {
        access_token: record.access_token,
        refresh_token: record.refresh_token ?? "",
        expires_at: record.expires_at,
        account_email: record.account_email,
        account_id: typeof record.account_id === "string" ? record.account_id : undefined,
        connected_at: new Date().toISOString(),
      }),
  });

  app.get("/api/integrations/zoom/status", requireAuthUser, (req, res) => {
    const cfg = getZoomConfig();
    const userId = getAuthUserId(req)!;
    const tokens = loadZoomTokens(userId);
    res.json({
      configured: isZoomConfigured(),
      connected: isZoomConnected(userId),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      rtms_supported: cfg?.rtmsSupported ?? false,
      note: rtmsPlatformNote(),
    });
  });

  app.post("/api/integrations/zoom/disconnect", requireAuthUser, (req, res) => {
    clearZoomTokens(getAuthUserId(req)!);
    res.json({ ok: true });
  });

  app.post("/api/integrations/zoom/live-session/start", requireAuthUser, (req, res) => {
    void (async () => {
      const userId = getAuthUserId(req)!;
      if (!isZoomConnected(userId)) {
        res.status(400).json({ error: "Connect Zoom first via Connect Zoom" });
        return;
      }
      if (req.body?.consent !== true) {
        res.status(400).json({
          error: "Confirm that participants know this meeting transcript is being analyzed.",
          code: "CONSENT_REQUIRED",
        });
        return;
      }
      const sb = serviceRoleClient();
      if (sb) {
        const { error } = await sb.from("live_meeting_consent").insert({
          user_id: userId,
          platform: "zoom",
          meeting_id: String(req.body?.meeting_id ?? "").trim() || null,
        });
        if (error) console.warn("[zoom-consent]", error.message);
      }
      const created = createZoomLiveSession(userId);
      res.json({ ...created, platform: "zoom" });
    })().catch((err) => {
      console.error("[zoom-live-start]", err);
      if (!res.headersSent) res.status(500).json({ error: "Could not start the Zoom session" });
    });
  });

  app.post("/api/integrations/zoom/live-transcript/ticket", (req, res) => {
    const sessionId = String(req.body?.sessionId ?? "");
    const sessionSecret = String(req.body?.sessionSecret ?? "");
    const session = getLiveSession(sessionId);
    if (!session || session.platform !== "zoom" || !sessionSecretOk(session, sessionSecret)) {
      res.status(404).json({ error: "Live session not found or expired" });
      return;
    }
    const ticket = issueStreamTicket(sessionId);
    if (!ticket) {
      res.status(404).json({ error: "Live session not found or expired" });
      return;
    }
    res.json({ ticket });
  });

  app.get("/api/integrations/zoom/live-transcript/stream", (req, res) => {
    const ticket = String(req.query.ticket ?? "");
    const sessionId = consumeStreamTicket(ticket) ?? "";
    const session = getLiveSession(sessionId);
    if (!session || session.platform !== "zoom") {
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
}
