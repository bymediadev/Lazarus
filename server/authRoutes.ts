import type { Express } from "express";
import { createClient } from "@supabase/supabase-js";
import { deleteAccountCascade } from "./accountDelete.js";
import { isSupabaseAuthConfigured } from "./authMiddleware.js";
import { resolveAuthUser } from "./founderAuth.js";
import { isGoogleMeetConfigured } from "./integrations/google/config.js";
import { isHubSpotConfigured } from "./integrations/hubspot/config.js";
import { isSalesforceConfigured } from "./integrations/salesforce/config.js";
import { resolveFrontendOrigin } from "./integrations/oauthShared.js";
import { claimPaidCheckout } from "./billing.js";
import { consumeLoginCode } from "./loginTickets.js";
import { rateLimit } from "./rateLimit.js";

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Production defaults on. Set AUTH_REQUIRE_EMAIL_DELIVERY=false only for local SMTP-less debugging. */
export function requireEmailDelivery(): boolean {
  const v = (process.env.AUTH_REQUIRE_EMAIL_DELIVERY ?? "").trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  if (v === "true" || v === "1" || v === "on") return true;
  return (process.env.NODE_ENV ?? "").trim() === "production";
}

async function claimBillingBestEffort(
  userId: string,
  email: string | null | undefined,
  sessionId?: string | null
): Promise<void> {
  try {
    await claimPaidCheckout({ id: userId, email: email ?? null }, { sessionId });
  } catch (err) {
    console.warn(
      "[auth-billing-claim]",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Lazarus product login — end users never visit the Supabase dashboard.
 * Google/HubSpot/Salesforce use Lazarus OAuth; email uses magic link.
 */
export function registerAuthRoutes(app: Express): void {
  app.use("/api/auth", rateLimit({ windowMs: 60_000, max: 20, name: "auth" }));
  app.get("/api/auth/status", (_req, res) => {
    const serverReady = !!(
      process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    );
    res.json({
      configured: isSupabaseAuthConfigured() && serverReady,
      email: isSupabaseAuthConfigured(),
      google: isGoogleMeetConfigured() && serverReady,
      hubspot: isHubSpotConfigured() && serverReady,
      salesforce: isSalesforceConfigured() && serverReady,
      note: serverReady
        ? "Lazarus login ready — email/password accounts; Google/HubSpot/Salesforce via app OAuth."
        : "Add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_*) to enable login.",
    });
  });

  /**
   * Public anon credentials for the Lazarus UI (safe to expose — same as VITE_SUPABASE_*).
   * Lets Render serve login without baking VITE_* at build time.
   */
  app.get("/api/auth/public-config", (_req, res) => {
    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
    const supabaseAnonKey = (
      process.env.SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      ""
    ).trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(503).json({
        configured: false,
        error: "Set SUPABASE_URL and SUPABASE_ANON_KEY on the server (or VITE_SUPABASE_*).",
      });
      return;
    }
    res.json({
      configured: true,
      supabaseUrl,
      supabaseAnonKey,
    });
  });

  /** Create Lazarus account (email + password) in Supabase Auth.users. */
  app.post("/api/auth/signup", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Enter a valid work email." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const admin = adminAuth();
    if (!admin) {
      res.status(503).json({
        error: "Account signup requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      });
      return;
    }

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        app_metadata: { login_provider: "password" },
      });
      if (created.error || !created.data.user) {
        const msg = created.error?.message ?? "Failed to create account";
        if (/already|registered|exists/i.test(msg)) {
          res.status(409).json({
            error: "An account with this email already exists. Sign in instead.",
          });
          return;
        }
        throw created.error ?? new Error(msg);
      }

      const sessionId = String(req.body?.session_id ?? "").trim() || null;
      await claimBillingBestEffort(created.data.user.id, email, sessionId);

      const redirectTo = resolveFrontendOrigin();
      const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
      const url = (process.env.SUPABASE_URL ?? "").trim();
      let emailed = false;
      if (url && anonKey) {
        const pub = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const otp = await pub.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
        });
        emailed = !otp.error;
        if (otp.error) console.warn("[auth-signup] confirm email:", otp.error.message);
      }
      if (!emailed) {
        res.status(503).json({
          error:
            "Account created, but we could not send the confirmation email. Configure Supabase Auth SMTP, then try Sign in.",
        });
        return;
      }
      res.json({
        ok: true,
        emailed: true,
        message: "Check your email to confirm your account, then sign in.",
      });
    } catch (err) {
      console.error("[auth-signup]", err);
      const msg = err instanceof Error ? err.message : "Could not create account";
      if (/already|registered|exists/i.test(msg)) {
        res.status(409).json({
          error: "An account with this email already exists. Sign in instead.",
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  /**
   * Password reset — email only. Never return recovery tokens to the browser.
   */
  app.post("/api/auth/password-reset", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Enter a valid work email." });
      return;
    }

    const generic = {
      ok: true,
      emailed: true,
      message: "If that email has an account, check the inbox for a reset link.",
    };

    try {
      const redirectTo = `${resolveFrontendOrigin().replace(/\/$/, "")}/?lazarus_reset=1`;
      const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
      const url = (process.env.SUPABASE_URL ?? "").trim();
      if (!url || !anonKey) {
        res.status(503).json({ error: "Password reset requires Supabase Auth on the server." });
        return;
      }
      const pub = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const sent = await pub.auth.resetPasswordForEmail(email, { redirectTo });
      if (sent.error && /rate limit/i.test(sent.error.message)) {
        res.status(429).json({
          error: "Too many reset emails were sent. Wait about an hour, then try again.",
        });
        return;
      }
      res.json(generic);
    } catch (err) {
      console.error("[auth-password-reset]", err);
      res.json(generic);
    }
  });

  /**
   * Consume the one-time login_code from the OAuth callback.
   * Returns a Supabase session (access + refresh). Never returns token_hash / email_otp / action_link.
   */
  app.post("/api/auth/exchange-login-code", async (req, res) => {
    const code = String(req.body?.login_code ?? "").trim();
    const session = consumeLoginCode(code);
    if (!session) {
      res.status(401).json({
        error: "That sign-in expired. Approve the popup again.",
      });
      return;
    }
    res.json({
      ok: true,
      email: session.email,
      provider: session.provider,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    });
  });

  app.post("/api/auth/session-from-provider", (_req, res) => {
    res.status(410).json({
      error: "This sign-in method was removed. Approve the OAuth popup again.",
    });
  });

  app.post("/api/auth/session-from-crm", (_req, res) => {
    res.status(410).json({
      error: "This sign-in method was removed. Approve the OAuth popup again.",
    });
  });

  /**
   * Email sign-in — inbox only. Never returns session tokens in JSON.
   */
  app.post("/api/auth/email-magic-link", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Enter a valid work email." });
      return;
    }

    const redirectTo = resolveFrontendOrigin();
    const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
    const url = (process.env.SUPABASE_URL ?? "").trim();
    if (!url || !anonKey) {
      res.status(503).json({
        error: "Email login requires SUPABASE_URL and SUPABASE_ANON_KEY.",
      });
      return;
    }

    try {
      const pub = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const otp = await pub.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (otp.error) {
        if (/rate limit/i.test(otp.error.message)) {
          res.status(429).json({
            error: "Too many sign-in emails. Wait about an hour, then try again.",
          });
          return;
        }
        res.status(503).json({
          error: "Could not send the sign-in email. Configure Supabase Auth SMTP.",
        });
        return;
      }
      res.json({
        ok: true,
        emailed: true,
        message: "Check your email for the Lazarus sign-in link.",
      });
    } catch (err) {
      console.error("[auth-email]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not start email sign-in",
      });
    }
  });

  app.post("/api/auth/delete-account", async (req, res) => {
    const user = await resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to delete your account." });
      return;
    }
    const confirm = String(req.body?.confirm ?? "").trim();
    if (confirm !== "DELETE") {
      res.status(400).json({ error: "Type DELETE to confirm account deletion." });
      return;
    }
    try {
      const result = await deleteAccountCascade(user.id);
      res.json(result);
    } catch (err) {
      console.error("[delete-account]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not delete account",
      });
    }
  });
}
