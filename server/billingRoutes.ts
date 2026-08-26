import type { Express, Request, Response } from "express";
import { resolveAuthUser, isOpsUser } from "./founderAuth.js";
import { isFounderUnlimitedEmail } from "./guestRateLimit.js";
import {
  claimGuestCap,
  claimPaidCheckout,
  createCheckoutSession,
  createPortalSession,
  getBillingSnapshot,
  handleStripeWebhookEvent,
  isStripeConfigured,
  previewCheckoutSession,
  type CheckoutPlan,
} from "./billing.js";

const CHECKOUT_PLANS = new Set<CheckoutPlan>(["ppu", "entry", "team"]);
const GUEST_CHECKOUT_LIMIT = 8;
const GUEST_CHECKOUT_WINDOW_MS = 60 * 60 * 1000;
const guestCheckoutHits = new Map<string, { count: number; resetAt: number }>();

function asCheckoutPlan(value: unknown): CheckoutPlan | null {
  const v = String(value ?? "");
  return CHECKOUT_PLANS.has(v as CheckoutPlan) ? (v as CheckoutPlan) : null;
}

function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function isGuestCheckoutRateLimited(req: Request): boolean {
  const now = Date.now();
  if (guestCheckoutHits.size > 2000) {
    for (const [key, bucket] of guestCheckoutHits) {
      if (bucket.resetAt <= now) guestCheckoutHits.delete(key);
    }
  }
  const ip = clientIp(req);
  let bucket = guestCheckoutHits.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + GUEST_CHECKOUT_WINDOW_MS };
    guestCheckoutHits.set(ip, bucket);
  }
  if (bucket.count >= GUEST_CHECKOUT_LIMIT) return true;
  bucket.count += 1;
  return false;
}

/** Must be registered before express.json() so the signature is computed on the raw body. */
export function registerBillingWebhook(app: Express): void {
  app.post("/api/billing/webhook", (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        try {
          const signature = req.headers["stripe-signature"];
          const sig = Array.isArray(signature) ? signature[0] : signature;
          await handleStripeWebhookEvent(Buffer.concat(chunks), sig);
          res.json({ received: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Webhook failed";
          console.error("Stripe webhook:", message);
          const status = message.includes("not configured") ? 503 : 400;
          res.status(status).json({ error: message });
        }
      })();
    });
  });
}

export function registerBillingRoutes(app: Express): void {
  app.get("/api/billing/me", async (req, res) => {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in to view billing." });
        return;
      }
      const billing = await getBillingSnapshot(user.id);
      if (!billing) {
        res.status(503).json({
          error: "Account billing is unavailable (database not configured).",
          configured: isStripeConfigured(),
        });
        return;
      }
      if (isOpsUser(user) || isFounderUnlimitedEmail(user.email)) {
        billing.can_lifecycle = true;
        billing.can_whitewhale = true;
        billing.unlimited = true;
      }
      res.json(billing);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Billing lookup failed" });
    }
  });

  app.post("/api/billing/claim-guest-cap", async (req, res) => {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in required." });
        return;
      }
      await claimGuestCap(user.id);
      const billing = await getBillingSnapshot(user.id);
      res.json(billing);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Could not sync free cap" });
    }
  });

  app.post("/api/billing/checkout", async (req, res) => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Billing not configured" });
        return;
      }
      const plan = asCheckoutPlan(req.body?.plan);
      if (!plan) {
        res.status(400).json({ error: "Choose ppu, entry, or team." });
        return;
      }
      const user = await resolveAuthUser(req);
      if (!user && isGuestCheckoutRateLimited(req)) {
        res.status(429).json({ error: "Too many checkout attempts. Wait a bit and try again." });
        return;
      }
      const session = await createCheckoutSession(plan, user);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Checkout failed" });
    }
  });

  app.get("/api/billing/checkout-preview", async (req, res) => {
    try {
      const sessionId = String(req.query.session_id ?? "").trim();
      if (!sessionId) {
        res.status(400).json({ error: "Missing session_id." });
        return;
      }
      const preview = await previewCheckoutSession(sessionId);
      if (!preview) {
        res.status(404).json({ error: "Checkout session not found." });
        return;
      }
      res.json(preview);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Preview failed" });
    }
  });

  app.post("/api/billing/claim", async (req, res) => {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in required." });
        return;
      }
      const sessionId = String(req.body?.session_id ?? "").trim() || null;
      const result = await claimPaidCheckout(
        { id: user.id, email: user.email ?? null },
        { sessionId }
      );
      const billing = await getBillingSnapshot(user.id);
      res.json({ ...result, billing });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not attach payment";
      const status = /already linked/i.test(message) ? 409 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/billing/portal", async (req, res) => {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in required." });
        return;
      }
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Billing not configured" });
        return;
      }
      const session = await createPortalSession(user);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Billing portal failed" });
    }
  });
}
