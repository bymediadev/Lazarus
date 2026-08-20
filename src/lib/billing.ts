import { API_BASE, apiAuthHeaders } from "./api";

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
    usage: "5 analyses",
    quality: "Standard model",
    qualityDetail: "Gemini 2.5 Flash",
    detail: "Then pay to continue.",
    features: [
      "Standard analysis — same model as $10",
      "Brief only — no deal lifecycle",
      "Sign in to save results",
    ],
  },
  {
    id: "ppu",
    price: "$10",
    title: "Per report",
    usage: "1 extra analysis",
    unitCost: "$10 per deal",
    quality: "Standard model",
    qualityDetail: "Gemini 2.5 Flash",
    detail: "One stalled deal this week — no subscription.",
    features: [
      "Standard analysis — same model as Free",
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
    quality: "Stronger model",
    qualityDetail: "Gemini 2.5 Pro — deeper reasoning than Free / $10",
    detail: "Default close. Better judgment on every run, not just more volume.",
    features: [
      "Stronger model than Free and $10 (Gemini 2.5 Pro)",
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
    quality: "Strongest model",
    qualityDetail: "Gemini 3.1 Pro — strongest reasoning we ship",
    detail: "Best model in the lineup. For teams inspecting many deals.",
    features: [
      "Strongest model — better than $99 Entry (Gemini 3.1 Pro)",
      "Deal lifecycle tracker",
      "WhiteWhale Why Now",
    ],
    checkout: "team",
  },
];

export const CHECKOUT_PLANS = PRICING_CARDS.filter(
  (card): card is PricingCard & { checkout: CheckoutPlan } => !!card.checkout
);

export const PRICING_USAGE_FOOTNOTE =
  "One analysis = one deal run. A recording, transcript, email thread, and docs in the same run still count as one. Free and $10 use the standard model. $99/mo uses a stronger model. $499/mo uses the strongest model.";

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

export async function startCheckout(plan: CheckoutPlan): Promise<void> {
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
