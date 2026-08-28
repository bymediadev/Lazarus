import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { getZoomConfig, isZoomConfigured } from "./config.js";
import { buildZoomAuthorizeUrl, exchangeZoomCode } from "./oauth.js";
import { clearZoomTokens, isZoomConnected, loadZoomTokens } from "./tokens.js";
import {
  createZoomLiveSession,
  getLiveSession,
  subscribeLiveSession,
} from "./transcriptBus.js";
import {
  handleZoomRtmsStarted,
  handleZoomRtmsStopped,
  rtmsPlatformNote,
  verifyZoomWebhookSignature,
  zoomWebhookValidationResponse,
} from "./rtmsHub.js";
import { resolveFrontendOrigin } from "../oauthShared.js";

const oauthStates = new Set<string>();

function newOAuthState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.add(state);
  return state;
}

function consumeOAuthState(state: string | undefined): boolean {
  if (!state || !oauthStates.has(state)) return false;
  oauthStates.delete(state);
  return true;
}

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
  const signature = req.headers["x-zm-signature"] as string | undefined;
  const timestamp = req.headers["x-zm-request-timestamp"] as string | undefined;

  if (cfg?.webhookSecret) {
    const valid = verifyZoomWebhookSignature(rawBody, signature, timestamp, cfg.webhookSecret);
    if (!valid) {
      res.status(401).json({ error: "Invalid Zoom webhook signature" });
      return;
    }
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
    if (!plainToken || !cfg?.webhookSecret) {
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
  app.get("/api/integrations/zoom/status", (_req, res) => {
    const cfg = getZoomConfig();
    const tokens = loadZoomTokens();
    res.json({
      configured: isZoomConfigured(),
      connected: isZoomConnected(),
      account_email: tokens?.account_email ?? null,
      connected_at: tokens?.connected_at ?? null,
      rtms_supported: cfg?.rtmsSupported ?? false,
      note: rtmsPlatformNote(),
    });
  });

  app.get("/api/integrations/zoom/connect", (_req, res) => {
    if (!isZoomConfigured()) {
      res.status(503).json({ error: "Zoom OAuth not configured on server" });
      return;
    }
    try {
      const state = newOAuthState();
      const url = buildZoomAuthorizeUrl(state);
      res.redirect(url);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start Zoom OAuth",
      });
    }
  });

  app.get("/api/integrations/zoom/callback", async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();

    if (!code || !consumeOAuthState(state)) {
      res.redirect(`${frontendOrigin}/?zoom=error&reason=invalid_state`);
      return;
    }

    try {
      await exchangeZoomCode(code);
      res.redirect(`${frontendOrigin}/?zoom=connected`);
    } catch (err) {
      console.error("[zoom-oauth] callback error:", err);
      res.redirect(`${frontendOrigin}/?zoom=error&reason=token_exchange`);
    }
  });

  app.post("/api/integrations/zoom/disconnect", (_req, res) => {
    clearZoomTokens();
    res.json({ ok: true });
  });

  app.post("/api/integrations/zoom/live-session/start", (_req, res) => {
    if (!isZoomConnected()) {
      res.status(400).json({ error: "Connect Zoom first via /api/integrations/zoom/connect" });
      return;
    }
    const sessionId = createZoomLiveSession();
    res.json({ sessionId, platform: "zoom" });
  });

  app.get("/api/integrations/zoom/live-transcript/stream", (req, res) => {
    const sessionId = String(req.query.sessionId ?? "");
    const session = getLiveSession(sessionId);
    if (!session) {
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
