import type { Express, Request, Response } from "express";
import { getZoomConfig, isZoomConfigured } from "./config.js";
import { buildZoomAuthorizeUrl, exchangeZoomCode } from "./oauth.js";
import {
  clearZoomTokens,
  isZoomConnected,
  loadZoomTokens,
  saveZoomTokens,
} from "./tokens.js";
import {
  createZoomLiveSession,
  getLiveSession,
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

/** Register before express.json() — Zoom HMAC requires raw body. */
export function registerZoomWebhook(app: Express): void {
  app.post("/api/webhooks/zoom", (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
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
  }

  res.json({ ok: true });
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
    const userId = getAuthUserId(req)!;
    if (!isZoomConnected(userId)) {
      res.status(400).json({ error: "Connect Zoom first via Connect Zoom" });
      return;
    }
    const created = createZoomLiveSession(userId);
    res.json({ ...created, platform: "zoom" });
  });

  app.get("/api/integrations/zoom/live-transcript/stream", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "");
    const sessionSecret = String(req.query.sessionSecret ?? "");
    const session = getLiveSession(sessionId);
    if (!session || !sessionSecretOk(session, sessionSecret)) {
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
