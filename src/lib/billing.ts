import { API_BASE, apiAuthHeaders } from "./api";
import { STRIPE_PAYMENT_LINKS } from "./site";

export type BillingPlan = "free" | "ppu" | "entry" | "team";
export type BillingStatus = "none" | "active" | "past_due" | "canceled";
export type CheckoutPlan = "ppu" | "entry" | "team";

export type BillingInvoice = {
  id: string;
  created: string;
  amount_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
};

export type BillingMe = {
  configured: boolean;
  plan: BillingPlan;
  plan_label: string;
  price_usd: number | null;
  status: BillingStatus;
  unlimited: boolean;
  free_cap: number;
  free_used: number;
  free_remaining: number;
  ppu_credits: number;
  entry_cap: number;
  entry_used_this_period: number;
  entry_remaining: number | null;
  analyses_remaining_label: string;
  period_end: string | null;
  can_analyze: boolean;
  payment_required: boolean;
  cap_hit_message?: string;
  usage_notice?: string | null;
  can_checkout: boolean;
  can_manage_portal: boolean;
  past_due: boolean;
  can_lifecycle: boolean;
  can_whitewhale: boolean;
  invoices: BillingInvoice[];
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

export type PricingCardId = "free" | CheckoutPlan;

export type PricingCard = {
  id: PricingCardId;
  price: string;
  title: string;
  usage: string;
  unitCost?: string;
  quality: string;
  qualityDetail: string;
  detail: string;
  features: string[];
  recommended?: boolean;
  checkout?: CheckoutPlan;
};

export const PRICING_CARDS: PricingCard[] = [
  {
    id: "free",
    price: "$0",
    title: "Free",
    usage: "5 analyses / month",
    quality: "Start here",
    qualityDetail: "Five runs a month to try a stalled deal",
    detail: "Sign in to save. No card required.",
    features: [
      "Forecast brief on one deal",
      "Sign in to save results",
      "No subscription",
    ],
  },
  {
    id: "ppu",
    price: "$10",
    title: "Per report",
    usage: "1 extra analysis",
    unitCost: "$10 per deal",
    quality: "As needed",
    qualityDetail: "Same brief as Free — no subscription",
    detail:
      "After you hit this month’s included cap, buy one extra report — or wait until your plan renews.",
    features: [
      "Same analysis as Free",
      "Brief only — no deal lifecycle",
    ],
    checkout: "ppu",
  },
  {
    id: "entry",
    price: "$99/mo",
    title: "Entry",
    usage: "20 analyses / month",
    unitCost: "~$5 per deal",
    quality: "Volume",
    qualityDetail: "Lifecycle tracker on saved deals",
    detail: "For a manager inspecting a real pipeline — not a trial.",
    features: [
      "Twenty analyses a month",
      "Deal lifecycle tracker",
      "Saved deals on this account",
    ],
    recommended: true,
    checkout: "entry",
  },
  {
    id: "team",
    price: "$499/mo",
    title: "Team",
    usage: "Unlimited analyses",
    quality: "Scale",
    qualityDetail: "Highest-reasoning model + deal lifecycle",
    detail: "Unlimited runs for more than one manager inspecting deals together. We send a usage heads-up if volume gets high.",
    features: [
      "Unlimited analyses",
      "Deal lifecycle tracker",
      "Highest-reasoning model",
    ],
    checkout: "team",
  },
];

export const CHECKOUT_PLANS = PRICING_CARDS.filter(
  (card): card is PricingCard & { checkout: CheckoutPlan } => !!card.checkout
);

export const PRICING_USAGE_FOOTNOTE =
  "One analysis = one deal run. Free and Entry have a monthly included cap — then $10 extra, or wait until the plan renews. Team is unlimited; we email a heads-up if usage gets high. $10 extras from one network stop at 100 a month."

async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...apiAuthHeaders(init?.body != null),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchBillingMe(): Promise<BillingMe> {
  return billingFetch<BillingMe>("/api/billing/me");
}

export async function claimGuestBillingCap(): Promise<BillingMe> {
  return billingFetch<BillingMe>("/api/billing/claim-guest-cap", {
    method: "POST",
    body: "{}",
  });
}

export const CHECKOUT_SESSION_STORAGE_KEY = "lazarus_checkout_session";

export function stashCheckoutSessionId(sessionId: string | null | undefined): void {
  const id = (sessionId ?? "").trim();
  if (!id.startsWith("cs_")) return;
  try {
    sessionStorage.setItem(CHECKOUT_SESSION_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function peekCheckoutSessionId(): string | null {
  try {
    const id = sessionStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY)?.trim() ?? "";
    return id.startsWith("cs_") ? id : null;
  } catch {
    return null;
  }
}

export function clearCheckoutSessionId(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function captureCheckoutSessionFromUrl(search = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get("session_id");
  stashCheckoutSessionId(fromQuery);
  return peekCheckoutSessionId();
}

export type CheckoutPreview = {
  email: string | null;
  plan: CheckoutPlan | null;
  plan_label: string | null;
  paid: boolean;
};

export async function fetchCheckoutPreview(sessionId: string): Promise<CheckoutPreview | null> {
  const res = await fetch(
    `${API_BASE}/api/billing/checkout-preview?session_id=${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) return null;
  return (await res.json()) as CheckoutPreview;
}

export async function claimCheckoutSession(sessionId?: string | null): Promise<BillingMe | null> {
  const id = (sessionId ?? peekCheckoutSessionId())?.trim() || "";
  const data = await billingFetch<{
    claimed?: boolean;
    billing?: BillingMe;
  }>("/api/billing/claim", {
    method: "POST",
    body: JSON.stringify({ session_id: id || undefined }),
  });
  if (data.claimed) clearCheckoutSessionId();
  return data.billing ?? null;
}

export type CheckoutContext = {
  email?: string | null;
  userId?: string | null;
};

function envPaymentLink(plan: CheckoutPlan): string {
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }
  ).env;
  const key =
    plan === "ppu"
      ? "VITE_STRIPE_PAYMENT_LINK_PPU"
      : plan === "entry"
        ? "VITE_STRIPE_PAYMENT_LINK_ENTRY"
        : "VITE_STRIPE_PAYMENT_LINK_TEAM";
  return (viteEnv?.[key] ?? "").trim();
}

export function paymentLinkFor(plan: CheckoutPlan): string | null {
  const url = envPaymentLink(plan) || STRIPE_PAYMENT_LINKS[plan];
  return url.startsWith("https://buy.stripe.com/") ? url : null;
}

export function directCheckoutReady(): boolean {
  return (["ppu", "entry", "team"] as const).every((plan) => !!paymentLinkFor(plan));
}

export function checkoutUrlFor(plan: CheckoutPlan, ctx?: CheckoutContext): string | null {
  const base = paymentLinkFor(plan);
  if (!base) return null;
  const url = new URL(base);
  const email = (ctx?.email ?? "").trim();
  if (email.includes("@")) url.searchParams.set("prefilled_email", email);
  const userId = (ctx?.userId ?? "").trim();
  if (userId) url.searchParams.set("client_reference_id", userId);
  return url.toString();
}

export async function startCheckout(plan: CheckoutPlan, ctx?: CheckoutContext): Promise<void> {
  const direct = checkoutUrlFor(plan, ctx);
  if (direct) {
    window.location.assign(direct);
    return;
  }
  const data = await billingFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  if (!data.url) throw new Error("Checkout did not return a URL.");
  window.location.href = data.url;
}

export async function startBillingPortal(): Promise<void> {
  const data = await billingFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
    body: "{}",
  });
  if (!data.url) throw new Error("Billing portal did not return a URL.");
  window.location.href = data.url;
}

export function formatInvoiceAmount(inv: BillingInvoice): string {
  const amount = (inv.amount_cents || 0) / 100;
  const currency = (inv.currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
