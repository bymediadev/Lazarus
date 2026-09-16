import type { Express, Request, Response } from "express";
import { issueLoginCode, type LoginTicketProvider } from "../loginTickets.js";
import { createVerifiedSupabaseSession } from "../oauthLogin.js";
import { requireAuthUser, getAuthUserId } from "../requireUser.js";
import {
  createSignedOAuthState,
  oauthFrontendReturnUrl,
  pickAllowedFrontendOrigin,
  publicApiBase,
  readSignedOAuthState,
  resolveFrontendOrigin,
} from "./oauthShared.js";

type Tokenish = {
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  account_email?: string;
  instance_url?: string;
  hub_id?: string;
  hub_domain?: string;
  account_id?: string;
  connected_at?: string;
};

export type OAuthPurpose = "login" | "connect";

export type OAuthPkceHooks = {
  begin: (res: Response, state: string, secret: string) => string;
  take: (req: Request, state: string, secret: string) => string | undefined;
  clear: (res: Response) => void;
};

export function registerOAuthConnectRoutes(
  app: Express,
  opts: {
    slug: string;
    queryKey: string;
    loginProvider?: LoginTicketProvider;
    notConfiguredMessage: string;
    getClientSecret: () => string | null;
    buildAuthorizeUrl: (
      state: string,
      purpose: OAuthPurpose,
      extras?: { codeChallenge?: string }
    ) => string;
    exchangeCode: (
      code: string,
      userId?: string,
      purpose?: OAuthPurpose,
      codeVerifier?: string
    ) => Promise<Tokenish>;
    saveForUser: (userId: string, record: Tokenish) => void | Promise<void>;
    /** Top-level hop so PKCE verifier cookie is first-party (not set on a cross-site POST). */
    pkce?: OAuthPkceHooks;
  }
): void {
  const startUrl = (state: string) =>
    opts.pkce
      ? `${publicApiBase()}/api/integrations/${opts.slug}/oauth-start?state=${encodeURIComponent(state)}`
      : opts.buildAuthorizeUrl(state, "login");

  const startLogin = (req: Request, res: Response) => {
    const secret = opts.getClientSecret();
    if (!secret) {
      res.status(503).json({ error: opts.notConfiguredMessage });
      return;
    }
    try {
      const returnOrigin =
        pickAllowedFrontendOrigin(req.query.return_origin) ?? resolveFrontendOrigin();
      const returnPath = req.query.return_path === "/portal" ? "/portal" : "/login";
      const state = createSignedOAuthState(secret, {
        purpose: "login",
        returnOrigin,
        returnPath,
      });
      res.redirect(startUrl(state));
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start OAuth",
      });
    }
  };

  if (opts.loginProvider) {
    app.get(`/api/integrations/${opts.slug}/connect`, startLogin);
  }

  app.post(`/api/integrations/${opts.slug}/connect`, requireAuthUser, (req, res) => {
    const secret = opts.getClientSecret();
    if (!secret) {
      res.status(503).json({ error: opts.notConfiguredMessage });
      return;
    }
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    try {
      const returnOrigin =
        pickAllowedFrontendOrigin(req.get("origin")) ?? resolveFrontendOrigin();
      const state = createSignedOAuthState(secret, {
        userId,
        purpose: "connect",
        returnOrigin,
        returnPath: "/portal",
      });
      res.json({
        url: opts.pkce
          ? startUrl(state)
          : opts.buildAuthorizeUrl(state, "connect"),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start OAuth",
      });
    }
  });

  if (opts.pkce) {
    app.get(`/api/integrations/${opts.slug}/oauth-start`, (req, res) => {
      const secret = opts.getClientSecret();
      const state = String(req.query.state ?? "");
      const parsed = readSignedOAuthState(state, secret ?? "");
      if (!secret || !parsed.ok) {
        res.redirect(
          oauthFrontendReturnUrl(parsed, { [opts.queryKey]: "error", reason: "invalid_state" })
        );
        return;
      }
      try {
        const challenge = opts.pkce!.begin(res, state, secret);
        res.redirect(opts.buildAuthorizeUrl(state, parsed.purpose, { codeChallenge: challenge }));
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : "Failed to start OAuth",
        });
      }
    });
  }

  app.get(`/api/integrations/${opts.slug}/callback`, async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const secret = opts.getClientSecret() ?? "";
    const parsed = readSignedOAuthState(state, secret);
    const bounce = (query: Record<string, string>) =>
      res.redirect(oauthFrontendReturnUrl(parsed, query));

    if (!code || !parsed.ok) {
      bounce({ [opts.queryKey]: "error", reason: "invalid_state" });
      return;
    }
    try {
      let codeVerifier: string | undefined;
      if (opts.pkce) {
        codeVerifier = opts.pkce.take(req, state, secret);
        opts.pkce.clear(res);
        if (!codeVerifier) {
          bounce({ [opts.queryKey]: "error", reason: "pkce_missing" });
          return;
        }
      }
      const record = await opts.exchangeCode(
        code,
        parsed.userId ?? undefined,
        parsed.purpose,
        codeVerifier
      );
      if (parsed.purpose === "connect" && parsed.userId) {
        await opts.saveForUser(parsed.userId, record);
        bounce({ [opts.queryKey]: "connected" });
        return;
      }
      if (opts.loginProvider) {
        const email = String(record.account_email ?? "").trim();
        if (!email) {
          bounce({ [opts.queryKey]: "error", reason: "no_email" });
          return;
        }
        const minted = await createVerifiedSupabaseSession(email, opts.loginProvider);
        // Login uses sign-in scopes (no refresh token). Do not overwrite Gmail/CRM tokens.
        if (record.refresh_token) {
          await opts.saveForUser(minted.userId, record);
        }
        const loginCode = issueLoginCode(minted);
        bounce({
          [opts.queryKey]: "connected",
          login_code: loginCode,
        });
        return;
      }
      bounce({ [opts.queryKey]: "connected" });
    } catch (err) {
      console.error(`[${opts.slug}-oauth] callback error:`, err);
      const reason =
        err instanceof Error && /TLS|certificate/i.test(err.message)
          ? "tls_certificate"
          : "token_exchange";
      bounce({ [opts.queryKey]: "error", reason });
    }
  });
}
