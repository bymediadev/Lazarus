/**
 * Upsert Stripe keys into local .env and ensure Lazarus prices + webhook exist.
 * Never prints secret values.
 *
 * Usage (keys from env or flags):
 *   node --env-file=.env scripts/apply-stripe-env.mjs
 *   node scripts/apply-stripe-env.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function upsertEnv(pairs) {
  let text = readFileSync(ENV_PATH, "utf8");
  if (!text.endsWith("\n")) text += "\n";
  if (!/^# ─── Stripe billing/m.test(text) && !/^STRIPE_SECRET_KEY=/m.test(text)) {
    text += "\n# ─── Stripe billing (paywall after 5 free analyses) ───\n";
  }
  for (const [key, value] of Object.entries(pairs)) {
    if (!value) continue;
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) text = text.replace(re, line);
    else text += `${line}\n`;
  }
  writeFileSync(ENV_PATH, text, "utf8");
}

function mask(value) {
  const s = (value ?? "").trim();
  if (!s) return "MISSING";
  return `SET ${s.slice(0, 8)}… len=${s.length}`;
}

if (!existsSync(ENV_PATH)) {
  console.error("Missing .env — copy .env.example to .env first.");
  process.exit(1);
}

const existing = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    })
);

const secretKey = (
  argValue("--secret") ??
  process.env.STRIPE_SECRET_KEY ??
  existing.STRIPE_SECRET_KEY ??
  ""
).trim();
const publishableKey = (
  argValue("--publishable") ??
  process.env.STRIPE_PUBLISHABLE_KEY ??
  existing.STRIPE_PUBLISHABLE_KEY ??
  ""
).trim();

if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY (sk_live_... or sk_test_...).");
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const account = await stripe.accounts.retrieve();
const live = secretKey.startsWith("sk_live_");

const plans = [
  {
    env: "STRIPE_PRICE_PPU",
    plan: "ppu",
    name: "Lazarus Per report",
    description: "One extra deal analysis.",
    unitAmount: 1000,
    recurring: null,
  },
  {
    env: "STRIPE_PRICE_ENTRY",
    plan: "entry",
    name: "Lazarus Entry",
    description: "20 analyses per month plus deal lifecycle.",
    unitAmount: 9900,
    recurring: { interval: "month" },
  },
  {
    env: "STRIPE_PRICE_TEAM",
    plan: "team",
    name: "Lazarus Team",
    description: "Unlimited analyses and deal lifecycle.",
    unitAmount: 49900,
    recurring: { interval: "month" },
  },
];

const products = await stripe.products.list({ limit: 100, active: true });
const prices = await stripe.prices.list({ limit: 100, active: true, expand: ["data.product"] });

const priceIds = {};
for (const plan of plans) {
  let price = prices.data.find((p) => {
    const product = typeof p.product === "object" && p.product ? p.product : null;
    const metaPlan = p.metadata?.lazarus_plan || product?.metadata?.lazarus_plan;
    return metaPlan === plan.plan && p.currency === "usd" && p.unit_amount === plan.unitAmount;
  });
  if (!price) {
    price = prices.data.find((p) => {
      const recurringOk = plan.recurring
        ? p.type === "recurring" && p.recurring?.interval === "month"
        : p.type === "one_time";
      return recurringOk && p.currency === "usd" && p.unit_amount === plan.unitAmount && p.active;
    });
  }
  if (!price) {
    let product = products.data.find((p) => p.metadata?.lazarus_plan === plan.plan);
    if (!product) {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { lazarus_plan: plan.plan },
      });
    }
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: plan.unitAmount,
      ...(plan.recurring ? { recurring: plan.recurring } : {}),
      metadata: { lazarus_plan: plan.plan },
    });
  }
  priceIds[plan.env] = price.id;
}

const webhookUrl = (
  process.env.PUBLIC_API_URL ||
  existing.PUBLIC_API_URL ||
  "https://lazarus-4uxi.onrender.com"
)
  .trim()
  .replace(/\/$/, "") + "/api/billing/webhook";

const webhookEvents = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];

const existingHooks = await stripe.webhookEndpoints.list({ limit: 100 });
let hook = existingHooks.data.find((h) => h.url === webhookUrl);
let webhookSecret = (existing.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
let webhookNote = "reused existing endpoint (secret kept if already in .env)";

if (!hook) {
  hook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: webhookEvents,
    description: "Lazarus billing",
  });
  webhookSecret = hook.secret ?? webhookSecret;
  webhookNote = "created";
} else {
  await stripe.webhookEndpoints.update(hook.id, { enabled_events: webhookEvents });
}

try {
  const portals = await stripe.billingPortal.configurations.list({ limit: 1, active: true });
  if (portals.data[0]) {
    await stripe.billingPortal.configurations.update(portals.data[0].id, {
      business_profile: {
        headline: "Lazarus Deal Recovery billing",
        privacy_policy_url: "https://www.getldr.ca/privacy",
        terms_of_service_url: "https://www.getldr.ca/terms",
      },
      features: {
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    });
  }
} catch (err) {
  console.log("Customer portal: skipped (" + (err?.message ?? "not enabled") + ")");
}

const pairs = {
  STRIPE_SECRET_KEY: secretKey,
  STRIPE_PUBLISHABLE_KEY: publishableKey,
  STRIPE_PRICE_PPU: priceIds.STRIPE_PRICE_PPU,
  STRIPE_PRICE_ENTRY: priceIds.STRIPE_PRICE_ENTRY,
  STRIPE_PRICE_TEAM: priceIds.STRIPE_PRICE_TEAM,
  ...(webhookSecret ? { STRIPE_WEBHOOK_SECRET: webhookSecret } : {}),
};
upsertEnv(pairs);

console.log("Stripe account:", account.settings?.dashboard?.display_name || account.email || account.id);
console.log("Mode:", live ? "live" : "test");
console.log("Updated .env:");
console.log("  STRIPE_SECRET_KEY=" + mask(secretKey));
console.log("  STRIPE_PUBLISHABLE_KEY=" + mask(publishableKey));
console.log("  STRIPE_PRICE_PPU=" + priceIds.STRIPE_PRICE_PPU);
console.log("  STRIPE_PRICE_ENTRY=" + priceIds.STRIPE_PRICE_ENTRY);
console.log("  STRIPE_PRICE_TEAM=" + priceIds.STRIPE_PRICE_TEAM);
console.log("  STRIPE_WEBHOOK_SECRET=" + mask(webhookSecret));
console.log("Webhook:", webhookNote, webhookUrl, hook.id);
if (!webhookSecret) {
  console.log(
    "Webhook secret missing — open the endpoint in Stripe Dashboard → Developers → Webhooks and copy Signing secret."
  );
}
console.log("Restart npm run dev so billing flips to configured.");
