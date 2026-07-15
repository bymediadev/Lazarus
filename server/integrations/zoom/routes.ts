import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { getZoomConfig, isZoomConfigured } from "./config.js";
import {
  buildZoomAuthorizeUrl,
  exchangeZoomCode,
  revokeAndClearZoomTokens,
} from "./oauth.js";
import { isZoomConnected, loadZoomTokens } from "./tokens.js";
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

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function oauthStateSecret(): string {
  const cfg = getZoomConfig();
  return (
    cfg?.clientSecret ||
    process.env.ZOOM_CLIENT_SECRET ||
    process.env.ZM_RTMS_SECRET ||
    "zoom-oauth-state"
  );
}

/** HMAC-signed state — survives Render free-tier sleep (no in-memory store). */
function newOAuthState(): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts = Date.now().toString(36);
  const payload = `${nonce}.${ts}`;
  const sig = crypto.createHmac("sha256", oauthStateSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function consumeOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, ts, sig] = parts;
  if (!nonce || !ts || !sig) return false;
  const payload = `${nonce}.${ts}`;
  const expected = crypto.createHmac("sha256", oauthStateSecret()).update(payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return false;
    }
  } catch {
    return false;
  }
  const issuedAt = parseInt(ts, 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > OAUTH_STATE_TTL_MS) return false;
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
  } else if (event === "app_deauthorized") {
    await handleZoomAppDeauthorized(payload, cfg?.clientId);
  }

  res.json({ ok: true });
}

/**
 * Marketplace uninstall: revoke Zoom tokens and delete local OAuth data.
 * @see https://developers.zoom.us/docs/integrations/oauth/#deauthorization
 */
async function handleZoomAppDeauthorized(
  payload: Record<string, unknown>,
  expectedClientId: string | undefined
): Promise<void> {
  const clientId = String(payload.client_id ?? "");
  if (expectedClientId && clientId && clientId !== expectedClientId) {
    console.warn("[zoom-oauth] deauth client_id mismatch — ignoring");
    return;
  }

  const deauthUserId = String(payload.user_id ?? "");
  const deauthAccountId = String(payload.account_id ?? "");
  const stored = loadZoomTokens();

  const matchesStored =
    !stored ||
    !deauthUserId ||
    !stored.zoom_user_id ||
    stored.zoom_user_id === deauthUserId ||
    (!!deauthAccountId && stored.zoom_account_id === deauthAccountId);

  if (!matchesStored) {
    console.warn("[zoom-oauth] deauth for unrelated user — ignoring");
    return;
  }

  console.log("[zoom-oauth] app_deauthorized — revoking tokens", {
    user_id: deauthUserId || undefined,
    account_id: deauthAccountId || undefined,
  });
  await revokeAndClearZoomTokens();
}

function resolveFrontendOrigin(): string {
  const fromEnv = (process.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const httpsPublic = fromEnv.find(
    (o) => o.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(o)
  );
  if (httpsPublic) return httpsPublic.replace(/\/$/, "");

  const publicApi = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (publicApi.startsWith("https://")) return publicApi;

  const anyNonLocal = fromEnv.find((o) => !/localhost|127\.0\.0\.1/i.test(o));
  if (anyNonLocal) return anyNonLocal.replace(/\/$/, "");

  return (fromEnv[0] ?? "http://localhost:5173").replace(/\/$/, "");
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
    void revokeAndClearZoomTokens().then(() => {
      res.json({ ok: true });
    });
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
