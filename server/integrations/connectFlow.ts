import type { Express, Request, Response } from "express";
import { issueLoginCode, type LoginTicketProvider } from "../loginTickets.js";
import { createVerifiedSupabaseSession } from "../oauthLogin.js";
import { requireAuthUser, getAuthUserId } from "../requireUser.js";
import {
  createSignedOAuthState,
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

export function registerOAuthConnectRoutes(
  app: Express,
  opts: {
    slug: string;
    queryKey: string;
    loginProvider?: LoginTicketProvider;
    notConfiguredMessage: string;
    getClientSecret: () => string | null;
    buildAuthorizeUrl: (state: string) => string;
    exchangeCode: (code: string, userId?: string) => Promise<Tokenish>;
    saveForUser: (userId: string, record: Tokenish) => void | Promise<void>;
  }
): void {
  const startLogin = (_req: Request, res: Response) => {
    const secret = opts.getClientSecret();
    if (!secret) {
      res.status(503).json({ error: opts.notConfiguredMessage });
      return;
    }
    try {
      const state = createSignedOAuthState(secret, { purpose: "login" });
      res.redirect(opts.buildAuthorizeUrl(state));
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
      const state = createSignedOAuthState(secret, { userId, purpose: "connect" });
      res.json({ url: opts.buildAuthorizeUrl(state) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to start OAuth",
      });
    }
  });

  app.get(`/api/integrations/${opts.slug}/callback`, async (req, res) => {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const frontendOrigin = resolveFrontendOrigin();
    const secret = opts.getClientSecret() ?? "";
    const parsed = readSignedOAuthState(state, secret);
    if (!code || !parsed.ok) {
      res.redirect(`${frontendOrigin}/?${opts.queryKey}=error&reason=invalid_state`);
      return;
    }
    try {
      const record = await opts.exchangeCode(code, parsed.userId ?? undefined);
      if (parsed.purpose === "connect" && parsed.userId) {
        await opts.saveForUser(parsed.userId, record);
        res.redirect(`${frontendOrigin}/?${opts.queryKey}=connected`);
        return;
      }
      if (opts.loginProvider) {
        const email = String(record.account_email ?? "").trim();
        if (!email) {
          res.redirect(`${frontendOrigin}/?${opts.queryKey}=error&reason=no_email`);
          return;
        }
        const minted = await createVerifiedSupabaseSession(email, opts.loginProvider);
        await opts.saveForUser(minted.userId, record);
        const loginCode = issueLoginCode(minted);
        res.redirect(
          `${frontendOrigin}/?${opts.queryKey}=connected&login_code=${encodeURIComponent(loginCode)}`
        );
        return;
      }
      res.redirect(`${frontendOrigin}/?${opts.queryKey}=connected`);
    } catch (err) {
      console.error(`[${opts.slug}-oauth] callback error:`, err);
      const reason =
        err instanceof Error && /TLS|certificate/i.test(err.message)
          ? "tls_certificate"
          : "token_exchange";
      res.redirect(`${frontendOrigin}/?${opts.queryKey}=error&reason=${reason}`);
    }
  });
}
