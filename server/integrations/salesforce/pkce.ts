import crypto from "crypto";
import type { Request, Response } from "express";
import { publicApiBase } from "../oauthShared.js";

export const SF_PKCE_COOKIE = "lz_sf_pkce";
const COOKIE_TTL_MS = 15 * 60 * 1000;

export function createSalesforcePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function sealSalesforcePkceCookie(secret: string, state: string, verifier: string): string {
  const sig = crypto.createHmac("sha256", secret).update(`${state}.${verifier}`).digest("hex");
  return `${verifier}.${sig}`;
}

export function openSalesforcePkceCookie(
  secret: string,
  state: string,
  raw: string | undefined
): string | undefined {
  if (!raw || !secret || !state) return undefined;
  const cut = raw.lastIndexOf(".");
  if (cut < 1) return undefined;
  const verifier = raw.slice(0, cut);
  const sig = raw.slice(cut + 1);
  const expected = crypto.createHmac("sha256", secret).update(`${state}.${verifier}`).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return undefined;
  } catch {
    return undefined;
  }
  return verifier;
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: publicApiBase().startsWith("https://"),
    maxAge: COOKIE_TTL_MS,
    path: "/api/integrations/salesforce",
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function beginSalesforcePkce(res: Response, state: string, secret: string): string {
  const { verifier, challenge } = createSalesforcePkce();
  res.cookie(SF_PKCE_COOKIE, sealSalesforcePkceCookie(secret, state, verifier), cookieOpts());
  return challenge;
}

export function takeSalesforcePkce(req: Request, state: string, secret: string): string | undefined {
  return openSalesforcePkceCookie(secret, state, readCookie(req, SF_PKCE_COOKIE));
}

export function clearSalesforcePkce(res: Response): void {
  res.clearCookie(SF_PKCE_COOKIE, {
    path: "/api/integrations/salesforce",
    httpOnly: true,
    sameSite: "lax",
    secure: publicApiBase().startsWith("https://"),
  });
}
