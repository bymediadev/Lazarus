import type { Request } from "express";
import { clientIp } from "./rateLimit.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function captchaSecret(): string {
  return (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
}

export function captchaSiteKey(): string {
  return (process.env.TURNSTILE_SITE_KEY ?? "").trim();
}

/** Production defaults on (same pattern as AUTH_REQUIRE_EMAIL_DELIVERY). Keys present → always enforce. */
export function captchaRequired(): boolean {
  const v = (process.env.CAPTCHA_REQUIRED ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  if (v === "true" || v === "1" || v === "on") return true;
  if (captchaSecret()) return true;
  return (process.env.NODE_ENV ?? "").trim() === "production";
}

export function captchaConfigured(): boolean {
  return Boolean(captchaSecret() && captchaSiteKey());
}

export function publicCaptchaConfig(): { required: boolean; site_key: string | null } {
  const siteKey = captchaSiteKey() || null;
  return {
    required: captchaRequired(),
    site_key: siteKey,
  };
}

export function captchaTokenFromRequest(req: {
  body?: unknown;
  headers: { [key: string]: unknown };
}): string {
  const rawHeader = req.headers["x-captcha-token"];
  const header = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader);
  if (typeof header === "string" && header.trim()) return header.trim();
  const body = req.body as { captcha_token?: unknown } | undefined;
  if (body && typeof body.captcha_token === "string") return body.captcha_token.trim();
  return "";
}

type FetchLike = typeof fetch;

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  const secret = captchaSecret();
  const trimmed = token.trim();
  if (!secret || !trimmed) return false;
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", trimmed);
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function enforceCaptcha(
  req: Request
): Promise<{ ok: true } | { ok: false; status: number; error: string; code: string }> {
  if (!captchaRequired()) return { ok: true };
  if (!captchaSecret()) {
    return {
      ok: false,
      status: 503,
      error: "Analysis captcha is not configured on the server.",
      code: "CAPTCHA_NOT_CONFIGURED",
    };
  }
  const token = captchaTokenFromRequest(req);
  if (!token) {
    return {
      ok: false,
      status: 403,
      error: "Complete the security check before running an analysis.",
      code: "CAPTCHA_REQUIRED",
    };
  }
  const ok = await verifyTurnstileToken(token, clientIp(req));
  if (!ok) {
    return {
      ok: false,
      status: 403,
      error: "Security check failed. Refresh the check and try again.",
      code: "CAPTCHA_FAILED",
    };
  }
  return { ok: true };
}
