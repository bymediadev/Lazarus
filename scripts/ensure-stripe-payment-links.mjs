/**
 * Create or reuse live Stripe Payment Links for PPU / Entry / Team.
 * Prints public buy.stripe.com URLs only — never the secret key.
 */
import "dotenv/config";
import Stripe from "stripe";

const SUCCESS =
  "https://www.getldr.ca/login?mode=signup&billing=success&session_id={CHECKOUT_SESSION_ID}";

const PLANS = [
  { plan: "ppu", env: "STRIPE_PRICE_PPU", customerCreation: "always" },
  { plan: "entry", env: "STRIPE_PRICE_ENTRY" },
  { plan: "team", env: "STRIPE_PRICE_TEAM" },
];

const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
if (!key.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY missing");
  process.exit(1);
}

const stripe = new Stripe(key);

async function listAllLinks() {
  const out = [];
  let startingAfter;
  for (;;) {
    const page = await stripe.paymentLinks.list({
      limit: 100,
      active: true,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    out.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return out;
}

const existing = await listAllLinks();
const urls = {};

for (const spec of PLANS) {
  const price = (process.env[spec.env] ?? "").trim();
  if (!price.startsWith("price_")) {
    console.error(`Missing ${spec.env}`);
    process.exit(1);
  }
  const reused = existing.find((link) => link.active && link.metadata?.plan === spec.plan);
  if (reused?.url) {
    urls[spec.plan] = reused.url;
    console.log(`${spec.plan} reuse ${reused.id}`);
    continue;
  }

  /** @type {import("stripe").Stripe.PaymentLinkCreateParams} */
  const params = {
    line_items: [{ price, quantity: 1 }],
    after_completion: { type: "redirect", redirect: { url: SUCCESS } },
    metadata: { plan: spec.plan, guest: "1" },
    billing_address_collection: "auto",
  };
  if (spec.customerCreation) {
    params.customer_creation = spec.customerCreation;
  } else {
    params.subscription_data = { metadata: { plan: spec.plan, guest: "1" } };
  }

  const created = await stripe.paymentLinks.create(params);
  if (!created.url) {
    console.error(`No URL for ${spec.plan}`);
    process.exit(1);
  }
  urls[spec.plan] = created.url;
  console.log(`${spec.plan} create ${created.id}`);
}

console.log("---");
for (const spec of PLANS) {
  console.log(`${spec.plan}\t${urls[spec.plan]}`);
}
