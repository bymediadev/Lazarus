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

export const CHECKOUT_PLANS: Array<{
  id: CheckoutPlan;
  price: string;
  title: string;
  detail: string;
  recommended?: boolean;
}> = [
  { id: "ppu", price: "$10", title: "Per report", detail: "One additional deal analysis after free runs" },
  {
    id: "entry",
    price: "$99/mo",
    title: "Entry",
    detail: "20 analyses + deal lifecycle tracker. Start here.",
    recommended: true,
  },
  {
    id: "team",
    price: "$499/mo",
    title: "Team",
    detail: "Unlimited analyses, lifecycle, and Why Now — for teams inspecting many deals",
  },
];

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
