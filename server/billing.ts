import type { User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { serviceRoleClient } from "./founderAuth.js";
import { resolveFrontendOrigin } from "./integrations/oauthShared.js";
import { maybeNotifyTeamUsage, teamUsageBanner } from "./teamUsageNotice.js";

export const FREE_ANALYSIS_CAP = 5;
export const ENTRY_PERIOD_CAP = 20;

export type BillingPlan = "free" | "ppu" | "entry" | "team";
export type BillingStatus = "none" | "active" | "past_due" | "canceled";
export type CheckoutPlan = "ppu" | "entry" | "team";
export type ConsumeKind = "exempt" | "guest" | "free" | "ppu" | "entry" | "team";

export type BillingRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: BillingPlan;
  status: BillingStatus;
  free_used: number;
  ppu_credits: number;
  entry_used_this_period: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingInvoice = {
  id: string;
  created: string;
  amount_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
};

export type BillingSnapshot = {
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
  cap_hit_message: string;
  usage_notice: string | null;
  can_checkout: boolean;
  can_manage_portal: boolean;
  past_due: boolean;
  can_lifecycle: boolean;
  can_whitewhale: boolean;
  invoices: BillingInvoice[];
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

export type EntitlementOk = { ok: true; consume: ConsumeKind };
export type EntitlementDenied = {
  ok: false;
  status: 402 | 429;
  code: "PAYMENT_REQUIRED" | "GUEST_USAGE_LIMIT";
  error: string;
};
export type EntitlementDecision = EntitlementOk | EntitlementDenied;

const PLANS: BillingPlan[] = ["free", "ppu", "entry", "team"];
const STATUSES: BillingStatus[] = ["none", "active", "past_due", "canceled"];

export const PAYMENT_REQUIRED_MESSAGE =
  "You’ve used your 5 free analyses this month. Buy a $10 extra report to keep going, or wait until next month when your allowance renews.";

export const PAST_DUE_MESSAGE =
  "Your subscription payment is past due. Update billing on your account to run more analyses.";

export const LIFECYCLE_REQUIRED_MESSAGE =
  "Deal lifecycle is on Entry ($99/mo) and Team ($499/mo). Your analyses stay saved — subscribe to see stalled vs unstuck over time.";

export type FeatureAccess = { lifecycle: boolean; whitewhale: boolean };

export function featureAccessFromRow(row: BillingRow): FeatureAccess {
  const subscribed = row.status === "active" && (row.plan === "entry" || row.plan === "team");
  return {
    lifecycle: subscribed,
    whitewhale: false,
  };
}

export function isStripeConfigured(): boolean {
  return !!(
    (process.env.STRIPE_SECRET_KEY ?? "").trim() &&
    (process.env.STRIPE_PRICE_PPU ?? "").trim() &&
    (process.env.STRIPE_PRICE_ENTRY ?? "").trim() &&
    (process.env.STRIPE_PRICE_TEAM ?? "").trim()
  );
}

function priceIds(): { ppu: string; entry: string; team: string } {
  return {
    ppu: (process.env.STRIPE_PRICE_PPU ?? "").trim(),
    entry: (process.env.STRIPE_PRICE_ENTRY ?? "").trim(),
    team: (process.env.STRIPE_PRICE_TEAM ?? "").trim(),
  };
}

export function planMeta(plan: BillingPlan): { label: string; price_usd: number | null } {
  switch (plan) {
    case "ppu":
      return { label: "$10 per report", price_usd: 10 };
    case "entry":
      return { label: "$99/mo · 20 analyses", price_usd: 99 };
    case "team":
      return { label: "$499/mo · unlimited", price_usd: 499 };
    default:
      return { label: "Free · 5 analyses / month", price_usd: 0 };
  }
}

export function publicAppOrigin(): string {
  return resolveFrontendOrigin();
}

function getStripe(): Stripe | null {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) return null;
  return new Stripe(key);
}

function asPlan(value: unknown): BillingPlan {
  const v = String(value ?? "free");
  return PLANS.includes(v as BillingPlan) ? (v as BillingPlan) : "free";
}

function asStatus(value: unknown): BillingStatus {
  const v = String(value ?? "none");
  return STATUSES.includes(v as BillingStatus) ? (v as BillingStatus) : "none";
}

function mapRow(raw: Record<string, unknown>): BillingRow {
  return {
    user_id: String(raw.user_id),
    stripe_customer_id: raw.stripe_customer_id ? String(raw.stripe_customer_id) : null,
    stripe_subscription_id: raw.stripe_subscription_id
      ? String(raw.stripe_subscription_id)
      : null,
    plan: asPlan(raw.plan),
    status: asStatus(raw.status),
    free_used: Number(raw.free_used) || 0,
    ppu_credits: Number(raw.ppu_credits) || 0,
    entry_used_this_period: Number(raw.entry_used_this_period) || 0,
    period_start: raw.period_start ? String(raw.period_start) : null,
    period_end: raw.period_end ? String(raw.period_end) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

function utcMonthStart(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
}

function utcMonthEnd(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

function includedMonthlyCap(row: BillingRow): number | null {
  if (row.plan === "entry" && row.status === "active") return ENTRY_PERIOD_CAP;
  return null;
}

function formatResetDay(iso: string | null): string {
  if (!iso) return "next month";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "next month";
  return d.toLocaleDateString("en-CA", { month: "long", day: "numeric", timeZone: "UTC" });
}

export function capHitMessage(row: BillingRow): string {
  if (row.status === "past_due") return PAST_DUE_MESSAGE;
  const when = formatResetDay(row.period_end);
  const cap = includedMonthlyCap(row);
  if (cap != null) {
    return `You’ve used your ${cap} analyses this month. Buy a $10 extra report to keep going, or wait until ${when} when your plan renews.`;
  }
  return `You’ve used your ${FREE_ANALYSIS_CAP} free analyses this month. Buy a $10 extra report to keep going, or wait until ${when} when your allowance renews.`;
}

function entitlementDeniedMessage(row: BillingRow): string {
  return capHitMessage(row);
}

async function rolloverIfNeeded(row: BillingRow): Promise<BillingRow> {
  const now = Date.now();
  const subscribed = (row.plan === "entry" || row.plan === "team") && row.status === "active";
  if (subscribed) {
    if (row.period_end && new Date(row.period_end).getTime() <= now) {
      const ended = new Date(row.period_end).getTime();
      const nextEnd = new Date(ended + 30 * 24 * 60 * 60 * 1000).toISOString();
      return (
        (await patchBilling(row.user_id, {
          entry_used_this_period: 0,
          period_start: row.period_end,
          period_end: nextEnd,
        })) ?? row
      );
    }
    return row;
  }
  if (!row.period_end) {
    return (
      (await patchBilling(row.user_id, {
        period_start: utcMonthStart().toISOString(),
        period_end: utcMonthEnd().toISOString(),
      })) ?? row
    );
  }
  if (new Date(row.period_end).getTime() <= now) {
    return (
      (await patchBilling(row.user_id, {
        free_used: 0,
        period_start: utcMonthStart().toISOString(),
        period_end: utcMonthEnd().toISOString(),
      })) ?? row
    );
  }
  return row;
}

export function skipsIpMonthlyCap(row: BillingRow): boolean {
  return row.status === "active" && (row.plan === "entry" || row.plan === "team");
}

export function evaluateCanAnalyze(row: BillingRow): { can: boolean; consume: ConsumeKind } {
  if (row.status === "past_due") {
    return { can: false, consume: "free" };
  }
  if (row.plan === "team" && row.status === "active") {
    return { can: true, consume: "team" };
  }
  if (row.plan === "entry" && row.status === "active") {
    if (row.entry_used_this_period < ENTRY_PERIOD_CAP) {
      return { can: true, consume: "entry" };
    }
    if (row.ppu_credits > 0) return { can: true, consume: "ppu" };
    return { can: false, consume: "entry" };
  }
  if (row.ppu_credits > 0) {
    return { can: true, consume: "ppu" };
  }
  if (row.free_used < FREE_ANALYSIS_CAP) {
    return { can: true, consume: "free" };
  }
  return { can: false, consume: "free" };
}

function remainingLabel(row: BillingRow, canAnalyze: boolean): string {
  if (row.status === "past_due") return "Payment past due";
  if (row.plan === "team" && row.status === "active") {
    return `Unlimited · ${row.entry_used_this_period} used this period`;
  }
  const included = includedMonthlyCap(row);
  if (included != null) {
    const left = Math.max(0, included - row.entry_used_this_period);
    const extra = row.ppu_credits > 0 ? ` + ${row.ppu_credits} pay-per-use` : "";
    if (left === 0 && row.ppu_credits === 0) {
      return `0 of ${included} this month — $10 extra, or wait until ${formatResetDay(row.period_end)}`;
    }
    return `${left} of ${included} this month${extra}`;
  }
  if (row.ppu_credits > 0) {
    const freeLeft = Math.max(0, FREE_ANALYSIS_CAP - row.free_used);
    const freeBit = freeLeft > 0 ? `${freeLeft} free + ` : "";
    return `${freeBit}${row.ppu_credits} pay-per-use credit${row.ppu_credits === 1 ? "" : "s"}`;
  }
  const freeLeft = Math.max(0, FREE_ANALYSIS_CAP - row.free_used);
  if (freeLeft > 0) return `${freeLeft} of ${FREE_ANALYSIS_CAP} this month`;
  if (!canAnalyze) {
    const when = formatResetDay(row.period_end);
    return `None — $10 extra, or wait until ${when}`;
  }
  return "None";
}

export function snapshotFromRow(
  row: BillingRow,
  opts: { invoices?: BillingInvoice[]; includeStripeIds?: boolean } = {}
): BillingSnapshot {
  const { can } = evaluateCanAnalyze(row);
  const meta = planMeta(row.plan);
  const pastDue = row.status === "past_due";
  const features = featureAccessFromRow(row);
  const snap: BillingSnapshot = {
    configured: isStripeConfigured(),
    plan: row.plan,
    plan_label: meta.label,
    price_usd: meta.price_usd,
    status: row.status,
    unlimited: row.plan === "team" && row.status === "active",
    free_cap: FREE_ANALYSIS_CAP,
    free_used: row.free_used,
    free_remaining: Math.max(0, FREE_ANALYSIS_CAP - row.free_used),
    ppu_credits: row.ppu_credits,
    entry_cap: includedMonthlyCap(row) ?? ENTRY_PERIOD_CAP,
    entry_used_this_period: row.entry_used_this_period,
    entry_remaining:
      includedMonthlyCap(row) != null
        ? Math.max(0, includedMonthlyCap(row)! - row.entry_used_this_period)
        : null,
    analyses_remaining_label: remainingLabel(row, can),
    period_end: row.period_end,
    can_analyze: can,
    payment_required: !can,
    cap_hit_message: capHitMessage(row),
    usage_notice:
      row.plan === "team" && row.status === "active" ? teamUsageBanner(row.entry_used_this_period) : null,
    can_checkout: isStripeConfigured(),
    can_manage_portal: isStripeConfigured() && !!row.stripe_customer_id,
    past_due: pastDue,
    can_lifecycle: features.lifecycle,
    can_whitewhale: features.whitewhale,
    invoices: opts.invoices ?? [],
  };
  if (opts.includeStripeIds) {
    snap.stripe_customer_id = row.stripe_customer_id;
    snap.stripe_subscription_id = row.stripe_subscription_id;
  }
  return snap;
}

export async function ensureBillingCustomer(userId: string): Promise<BillingRow | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;

  const { data: existing, error: readErr } = await supabase
    .from("billing_customers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) {
    console.error("billing read failed:", readErr.message);
  }
  if (existing) return rolloverIfNeeded(mapRow(existing as Record<string, unknown>));

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("billing_customers")
    .insert({
      user_id: userId,
      plan: "free",
      status: "none",
      period_start: utcMonthStart().toISOString(),
      period_end: utcMonthEnd().toISOString(),
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) {
    const { data: again } = await supabase
      .from("billing_customers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return again ? mapRow(again as Record<string, unknown>) : null;
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getFeatureAccess(userId: string): Promise<FeatureAccess> {
  const row = await ensureBillingCustomer(userId);
  if (!row) return { lifecycle: false, whitewhale: false };
  return featureAccessFromRow(row);
}

async function patchBilling(
  userId: string,
  patch: Record<string, unknown>
): Promise<BillingRow | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("billing_customers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("billing update failed:", error.message);
    return null;
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function claimGuestCap(userId: string): Promise<BillingRow | null> {
  const row = await ensureBillingCustomer(userId);
  if (!row) return null;
  if (row.free_used >= FREE_ANALYSIS_CAP) return row;
  return patchBilling(userId, { free_used: FREE_ANALYSIS_CAP });
}

export async function reserveAnalysis(userId: string): Promise<EntitlementDecision> {
  const row = await ensureBillingCustomer(userId);
  if (!row) {
    return { ok: true, consume: "free" };
  }
  const { can, consume } = evaluateCanAnalyze(row);
  if (!can) {
    return {
      ok: false,
      status: 402,
      code: "PAYMENT_REQUIRED",
      error: entitlementDeniedMessage(row),
    };
  }

  if (consume === "free") {
    const supabase = serviceRoleClient();
    if (!supabase) return { ok: true, consume };
    const { data, error } = await supabase
      .from("billing_customers")
      .update({ free_used: row.free_used + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("free_used", row.free_used)
      .lt("free_used", FREE_ANALYSIS_CAP)
      .select("user_id")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        status: 402,
        code: "PAYMENT_REQUIRED",
        error: PAYMENT_REQUIRED_MESSAGE,
      };
    }
    return { ok: true, consume };
  }
  if (consume === "ppu") {
    const supabase = serviceRoleClient();
    if (!supabase) return { ok: true, consume };
    const { data, error } = await supabase
      .from("billing_customers")
      .update({ ppu_credits: row.ppu_credits - 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("ppu_credits", row.ppu_credits)
      .gt("ppu_credits", 0)
      .select("user_id")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        status: 402,
        code: "PAYMENT_REQUIRED",
        error: PAYMENT_REQUIRED_MESSAGE,
      };
    }
    return { ok: true, consume };
  }
  if (consume === "entry") {
    const supabase = serviceRoleClient();
    if (!supabase) return { ok: true, consume };
    const { data, error } = await supabase
      .from("billing_customers")
      .update({
        entry_used_this_period: row.entry_used_this_period + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("entry_used_this_period", row.entry_used_this_period)
      .lt("entry_used_this_period", ENTRY_PERIOD_CAP)
      .select("user_id")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        status: 402,
        code: "PAYMENT_REQUIRED",
        error: entitlementDeniedMessage(row),
      };
    }
    return { ok: true, consume };
  }
  if (consume === "team") {
    const supabase = serviceRoleClient();
    if (!supabase) return { ok: true, consume };
    const nextUsed = row.entry_used_this_period + 1;
    const { data, error } = await supabase
      .from("billing_customers")
      .update({
        entry_used_this_period: nextUsed,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("entry_used_this_period", row.entry_used_this_period)
      .select("user_id")
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        status: 402,
        code: "PAYMENT_REQUIRED",
        error: entitlementDeniedMessage(row),
      };
    }
    void maybeNotifyTeamUsage(userId, nextUsed, row.period_start).catch((err) => {
      console.warn("[team-usage] notice failed:", err instanceof Error ? err.message : err);
    });
    return { ok: true, consume };
  }
  return { ok: true, consume };
}

export async function releaseReservation(userId: string, consume: ConsumeKind): Promise<void> {
  if (consume === "exempt" || consume === "guest") return;
  const row = await ensureBillingCustomer(userId);
  if (!row) return;
  if (consume === "free") {
    await patchBilling(userId, { free_used: Math.max(0, row.free_used - 1) });
    return;
  }
  if (consume === "ppu") {
    await patchBilling(userId, { ppu_credits: row.ppu_credits + 1 });
    return;
  }
  if (consume === "entry" || consume === "team") {
    await patchBilling(userId, {
      entry_used_this_period: Math.max(0, row.entry_used_this_period - 1),
    });
  }
}

async function listInvoices(customerId: string | null): Promise<BillingInvoice[]> {
  if (!customerId) return [];
  const stripe = getStripe();
  if (!stripe) return [];
  try {
    const list = await stripe.invoices.list({ customer: customerId, limit: 5 });
    return list.data.map((inv) => ({
      id: inv.id,
      created: new Date(inv.created * 1000).toISOString(),
      amount_cents: inv.amount_paid || inv.amount_due || 0,
      currency: inv.currency ?? "usd",
      status: inv.status ?? "open",
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
    }));
  } catch (err) {
    console.warn("Stripe invoices list failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getBillingSnapshot(
  userId: string,
  opts: { includeStripeIds?: boolean } = {}
): Promise<BillingSnapshot | null> {
  const row = await ensureBillingCustomer(userId);
  if (!row) return null;
  const invoices = await listInvoices(row.stripe_customer_id);
  return snapshotFromRow(row, { invoices, includeStripeIds: opts.includeStripeIds });
}

async function ensureStripeCustomer(user: User): Promise<string> {
  const row = await ensureBillingCustomer(user.id);
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");
  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { lazarus_user_id: user.id },
  });
  await patchBilling(user.id, { stripe_customer_id: customer.id });
  return customer.id;
}

function checkoutPriceId(plan: CheckoutPlan): string {
  const prices = priceIds();
  const price = plan === "ppu" ? prices.ppu : plan === "entry" ? prices.entry : prices.team;
  if (!price) throw new Error("Missing Stripe price ID for that plan.");
  return price;
}

function sessionIsPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.status === "complete";
}

function sessionEmail(session: Stripe.Checkout.Session): string | null {
  const fromDetails = session.customer_details?.email?.trim().toLowerCase();
  if (fromDetails) return fromDetails;
  const fromSession = session.customer_email?.trim().toLowerCase();
  return fromSession || null;
}

function sessionPlan(session: Stripe.Checkout.Session): CheckoutPlan | null {
  const raw = session.metadata?.plan;
  if (raw === "ppu" || raw === "entry" || raw === "team") return raw;
  const item = session.line_items?.data?.[0];
  const price = item?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  return planFromPriceId(priceId);
}

export type CheckoutPreview = {
  email: string | null;
  plan: CheckoutPlan | null;
  plan_label: string | null;
  paid: boolean;
};

export async function previewCheckoutSession(sessionId: string): Promise<CheckoutPreview | null> {
  const id = sessionId.trim();
  if (!id.startsWith("cs_")) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items"],
    });
    const plan = sessionPlan(session);
    return {
      email: sessionEmail(session),
      plan,
      plan_label: plan ? planMeta(plan).label : null,
      paid: sessionIsPaid(session),
    };
  } catch {
    return null;
  }
}

export async function createCheckoutSession(
  plan: CheckoutPlan,
  user?: User | null
): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    throw new Error("Billing is not configured yet.");
  }
  const stripe = getStripe();
  if (!stripe) throw new Error("Billing is not configured yet.");
  const price = checkoutPriceId(plan);
  const origin = publicAppOrigin();
  const mode = plan === "ppu" ? "payment" : "subscription";

  if (user) {
    const customer = await ensureStripeCustomer(user);
    const session = await stripe.checkout.sessions.create({
      mode,
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
      metadata: { user_id: user.id, plan },
      ...(plan !== "ppu"
        ? { subscription_data: { metadata: { user_id: user.id, plan } } }
        : {}),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url };
  }

  const session = await stripe.checkout.sessions.create({
    mode,
    ...(plan === "ppu" ? { customer_creation: "always" as const } : {}),
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/login?mode=signup&billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?billing=cancel#pricing`,
    metadata: { plan, guest: "1" },
    ...(plan !== "ppu" ? { subscription_data: { metadata: { plan, guest: "1" } } } : {}),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url };
}

export async function createPortalSession(user: User): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    throw new Error("Billing is not configured yet.");
  }
  const stripe = getStripe();
  if (!stripe) throw new Error("Billing is not configured yet.");
  const customerId = await ensureStripeCustomer(user);
  const origin = publicAppOrigin();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/`,
  });
  return { url: session.url };
}

async function tagCustomerForClaim(
  stripe: Stripe,
  customerId: string,
  session: Stripe.Checkout.Session,
  userId?: string
): Promise<void> {
  const plan = sessionPlan(session) ?? "";
  try {
    await stripe.customers.update(customerId, {
      metadata: {
        lazarus_plan: plan,
        lazarus_checkout_session: session.id,
        ...(userId ? { lazarus_user_id: userId } : { lazarus_guest: "1" }),
      },
    });
  } catch (err) {
    console.warn(
      "[billing] customer metadata tag failed:",
      err instanceof Error ? err.message : err
    );
  }
}

async function attachCheckoutToUser(
  userId: string,
  session: Stripe.Checkout.Session
): Promise<void> {
  const stripe = getStripe();
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? undefined;
  const owner = customerId ? await findUserIdForCustomer(customerId) : null;
  const claimed = session.metadata?.lazarus_claimed_user_id?.trim();
  if ((owner && owner !== userId) || (claimed && claimed !== userId)) {
    throw new Error("This payment is already linked to another Lazarus account.");
  }

  await ensureBillingCustomer(userId);
  if (customerId) {
    await patchBilling(userId, { stripe_customer_id: customerId });
  }

  const alreadyOnUser = owner === userId || claimed === userId;
  if (!alreadyOnUser) {
    if (session.mode === "payment") {
      await applyPpuPurchase(userId, customerId);
    } else if (session.mode === "subscription" && session.subscription) {
      if (!stripe) throw new Error("Stripe is not configured.");
      const subId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      await applySubscription(userId, sub);
    }
  }

  if (stripe) {
    const plan = sessionPlan(session) ?? session.metadata?.plan ?? "";
    try {
      await stripe.checkout.sessions.update(session.id, {
        metadata: {
          plan,
          guest: session.metadata?.guest ?? "",
          lazarus_claimed_user_id: userId,
          ...(session.metadata?.user_id ? { user_id: session.metadata.user_id } : {}),
        },
      });
    } catch (err) {
      console.warn(
        "[billing] session claim metadata failed:",
        err instanceof Error ? err.message : err
      );
    }
    if (customerId) {
      await tagCustomerForClaim(stripe, customerId, session, userId);
    }
  }
}

async function findUnclaimedPaidSessionForEmail(
  email: string
): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const customers = await stripe.customers.list({ email, limit: 10 });
  for (const customer of customers.data) {
    const owner = await findUserIdForCustomer(customer.id);
    if (owner) continue;
    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 10 });
    const paid = sessions.data.find(
      (s) => sessionIsPaid(s) && s.metadata?.lazarus_claimed_user_id !== owner
    );
    const unclaimed = sessions.data.find(
      (s) => sessionIsPaid(s) && !s.metadata?.lazarus_claimed_user_id
    );
    if (unclaimed) return unclaimed;
    if (paid && !owner) return paid;
  }
  return null;
}

export async function claimPaidCheckout(
  user: { id: string; email?: string | null },
  opts: { sessionId?: string | null } = {}
): Promise<{ claimed: boolean; reason?: string }> {
  if (!isStripeConfigured()) return { claimed: false, reason: "not_configured" };
  const stripe = getStripe();
  if (!stripe) return { claimed: false, reason: "not_configured" };

  const sessionId = (opts.sessionId ?? "").trim();
  try {
    if (sessionId.startsWith("cs_")) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!sessionIsPaid(session)) {
        return { claimed: false, reason: "unpaid" };
      }
      await attachCheckoutToUser(user.id, session);
      return { claimed: true };
    }

    const email = (user.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return { claimed: false, reason: "no_session" };
    }
    const session = await findUnclaimedPaidSessionForEmail(email);
    if (!session) return { claimed: false, reason: "not_found" };
    await attachCheckoutToUser(user.id, session);
    return { claimed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claim failed";
    if (/already linked/i.test(message)) throw err;
    console.warn("[billing] claim failed:", message);
    return { claimed: false, reason: "error" };
  }
}

function subscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "none";
}

function planFromPriceId(priceId: string | undefined): CheckoutPlan | null {
  if (!priceId) return null;
  const prices = priceIds();
  if (priceId === prices.entry) return "entry";
  if (priceId === prices.team) return "team";
  if (priceId === prices.ppu) return "ppu";
  return null;
}

function subscriptionPriceId(sub: Stripe.Subscription): string | undefined {
  const price = sub.items.data[0]?.price;
  if (!price) return undefined;
  return typeof price === "string" ? price : price.id;
}

async function findUserIdForCustomer(customerId: string, fallbackUserId?: string): Promise<string | null> {
  if (fallbackUserId) return fallbackUserId;
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

function subscriptionPeriod(sub: Stripe.Subscription): { start: string; end: string } {
  const item = sub.items.data[0];
  const startUnix = item?.current_period_start ?? sub.billing_cycle_anchor;
  const endUnix = item?.current_period_end ?? startUnix + 30 * 24 * 60 * 60;
  return {
    start: new Date(startUnix * 1000).toISOString(),
    end: new Date(endUnix * 1000).toISOString(),
  };
}

async function applySubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const row = await ensureBillingCustomer(userId);
  if (!row) return;
  const priceId = subscriptionPriceId(sub);
  const mapped = planFromPriceId(priceId);
  const status = subscriptionStatus(sub.status);
  const { start: periodStart, end: periodEnd } = subscriptionPeriod(sub);
  const newPeriod = !row.period_start || periodStart > row.period_start;
  const plan: BillingPlan =
    status === "canceled" ? (row.ppu_credits > 0 ? "ppu" : "free") : mapped === "team" || mapped === "entry" ? mapped : row.plan;

  await patchBilling(userId, {
    stripe_subscription_id: status === "canceled" ? null : sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : row.stripe_customer_id,
    plan,
    status: status === "canceled" && row.ppu_credits > 0 ? "active" : status,
    period_start: periodStart,
    period_end: periodEnd,
    entry_used_this_period:
      (plan === "entry" || plan === "team") && newPeriod ? 0 : row.entry_used_this_period,
  });
}

async function applyPpuPurchase(userId: string, customerId?: string): Promise<void> {
  const row = await ensureBillingCustomer(userId);
  if (!row) return;
  const nextPlan: BillingPlan =
    row.plan === "entry" || row.plan === "team" ? row.plan : "ppu";
  const nextStatus: BillingStatus =
    row.status === "past_due" ? row.status : row.status === "none" ? "active" : row.status;
  await patchBilling(userId, {
    ppu_credits: row.ppu_credits + 1,
    plan: nextPlan,
    status: nextStatus,
    ...(customerId ? { stripe_customer_id: customerId } : {}),
  });
}

export async function handleStripeWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const stripe = getStripe();
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!stripe || !secret) {
    throw new Error("Stripe webhook is not configured.");
  }
  if (!signature) {
    throw new Error("Missing Stripe-Signature header.");
  }
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId =
      session.metadata?.user_id || session.client_reference_id || undefined;
    const customerId = typeof session.customer === "string" ? session.customer : undefined;
    if (customerId) {
      await tagCustomerForClaim(stripe, customerId, session, userId);
    }
    if (!userId) return;
    await ensureBillingCustomer(userId);
    if (customerId) {
      await patchBilling(userId, { stripe_customer_id: customerId });
    }
    if (session.mode === "payment") {
      await applyPpuPurchase(userId, customerId);
    } else if (session.mode === "subscription" && session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      await applySubscription(userId, sub);
    }
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : "";
    const userId = await findUserIdForCustomer(customerId, sub.metadata?.user_id);
    if (!userId) return;
    await applySubscription(userId, sub);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : "";
    const userId = await findUserIdForCustomer(customerId, sub.metadata?.user_id);
    if (!userId) return;
    await applySubscription(userId, sub);
    return;
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.billing_reason !== "subscription_cycle") return;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
    const userId = await findUserIdForCustomer(customerId);
    if (!userId) return;
    const row = await ensureBillingCustomer(userId);
    if (!row || (row.plan !== "entry" && row.plan !== "team")) return;
    await patchBilling(userId, { entry_used_this_period: 0 });
  }
}

/** Best-effort Stripe cancel before auth user delete. Never throws. */
export async function cancelBillingOnAccountDelete(userId: string): Promise<void> {
  try {
    const row = await ensureBillingCustomer(userId);
    const stripe = getStripe();
    const subId = row?.stripe_subscription_id?.trim();
    if (stripe && subId) {
      await stripe.subscriptions.cancel(subId);
    }
  } catch (err) {
    console.warn(
      "[billing] cancel on account delete failed:",
      err instanceof Error ? err.message : err
    );
  }
}
