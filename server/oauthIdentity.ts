export type OAuthLoginReason = "email_unverified" | "ops_password_only" | "account_exists";

export type OAuthLoginDecision =
  | { ok: false; reason: OAuthLoginReason }
  | { ok: true; mode: "existing"; userId: string }
  | { ok: true; mode: "create" };

export class OAuthLoginError extends Error {
  reason: OAuthLoginReason;

  constructor(reason: OAuthLoginReason) {
    super(reason);
    this.name = "OAuthLoginError";
    this.reason = reason;
  }
}

/**
 * OAuth may mint a session only for a verified provider subject.
 * An email match without that subject is a refusal, not a login.
 */
export function decideOAuthLogin(input: {
  emailVerified: boolean;
  providerSub: string;
  email: string;
  opsEmails: readonly string[];
  identityUserId: string | null;
  identityIsOps: boolean;
  emailOwnerUserId: string | null;
}): OAuthLoginDecision {
  const email = input.email.trim().toLowerCase();
  const sub = input.providerSub.trim();
  if (!input.emailVerified || !sub || !email.includes("@")) {
    return { ok: false, reason: "email_unverified" };
  }
  const ops = new Set(input.opsEmails.map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (ops.has(email)) return { ok: false, reason: "ops_password_only" };
  if (input.identityUserId) {
    if (input.identityIsOps) return { ok: false, reason: "ops_password_only" };
    return { ok: true, mode: "existing", userId: input.identityUserId };
  }
  if (input.emailOwnerUserId) return { ok: false, reason: "account_exists" };
  return { ok: true, mode: "create" };
}

/** Stripe email search is only for a confirmed account, and never without one. */
export function claimCheckoutAllowed(input: {
  emailConfirmed: boolean;
  sessionId?: string | null;
}): { searchByEmail: boolean; allowSession: boolean; reason?: "unconfirmed" } {
  if (!input.emailConfirmed) {
    return { searchByEmail: false, allowSession: false, reason: "unconfirmed" };
  }
  const sessionId = (input.sessionId ?? "").trim();
  if (sessionId.startsWith("cs_")) {
    return { searchByEmail: false, allowSession: true };
  }
  return { searchByEmail: true, allowSession: false };
}

/** A different owner cannot take a CRM link. A null owner can be claimed. */
export function crmLinkWriteAllowed(
  existingUserId: string | null | undefined,
  incomingUserId: string | null | undefined
): boolean {
  const existing = (existingUserId ?? "").trim();
  const incoming = (incomingUserId ?? "").trim();
  if (!existing || !incoming) return true;
  return existing === incoming;
}

/** Header only. A query-string secret is ignored so it cannot land in access logs. */
export function readSalesforceWebhookSecret(
  headers: { [key: string]: unknown },
  _query?: unknown
): string {
  void _query;
  const raw = headers["x-webhook-secret"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}
