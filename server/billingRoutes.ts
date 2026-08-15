import type { Express, Request, Response } from "express";
import { resolveAuthUser, isOpsUser } from "./founderAuth.js";
import { isFounderUnlimitedEmail } from "./guestRateLimit.js";
import {
  claimGuestCap,
  createCheckoutSession,
  createPortalSession,
  getBillingSnapshot,
  handleStripeWebhookEvent,
  isStripeConfigured,
  type CheckoutPlan,
} from "./billing.js";

const CHECKOUT_PLANS = new Set<CheckoutPlan>(["ppu", "entry", "team"]);

function asCheckoutPlan(value: unknown): CheckoutPlan | null {
  const v = String(value ?? "");
  return CHECKOUT_PLANS.has(v as CheckoutPlan) ? (v as CheckoutPlan) : null;
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
      const user = await resolveAuthUser(req);
      if (!user) {
        res.status(401).json({ error: "Sign in to pay." });
        return;
      }
      if (!isStripeConfigured()) {
        res.status(503).json({ error: "Billing not configured" });
        return;
      }
      const plan = asCheckoutPlan(req.body?.plan);
      if (!plan) {
        res.status(400).json({ error: "Choose ppu, entry, or team." });
        return;
      }
      const session = await createCheckoutSession(user, plan);
      res.json(session);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Checkout failed" });
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
