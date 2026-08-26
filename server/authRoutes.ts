import type { Express } from "express";
import { createClient } from "@supabase/supabase-js";
import { deleteAccountCascade } from "./accountDelete.js";
import { isSupabaseAuthConfigured } from "./authMiddleware.js";
import { resolveAuthUser } from "./founderAuth.js";
import { isGoogleMeetConfigured } from "./integrations/google/config.js";
import { loadGoogleTokens } from "./integrations/google/tokens.js";
import { isHubSpotConfigured } from "./integrations/hubspot/config.js";
import { loadHubSpotTokens } from "./integrations/hubspot/tokens.js";
import { isSalesforceConfigured } from "./integrations/salesforce/config.js";
import { loadSalesforceTokens } from "./integrations/salesforce/tokens.js";
import { resolveFrontendOrigin } from "./integrations/oauthShared.js";

type AuthProviderId = "google" | "hubspot" | "salesforce";

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function emailForProvider(provider: AuthProviderId): string | null {
  if (provider === "google") return loadGoogleTokens()?.account_email?.trim() || null;
  if (provider === "hubspot") return loadHubSpotTokens()?.account_email?.trim() || null;
  return loadSalesforceTokens()?.account_email?.trim() || null;
}

/** Create/find auth user and return hashes the Lazarus UI uses to open a session. */
async function mintSessionPayload(email: string, provider: AuthProviderId) {
  const admin = adminAuth();
  if (!admin) {
    throw new Error("Login requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
  }

  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = (existing.data?.users ?? []) as Array<{ id: string; email?: string | null }>;
  let userId = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { login_provider: provider },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Failed to create Lazarus user");
    }
    userId = created.data.user.id;
  }

  const redirectTo = resolveFrontendOrigin();
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (link.error) throw link.error;

  const props = link.data.properties as {
    hashed_token?: string;
    email_otp?: string;
    action_link?: string;
  };

  return {
    ok: true as const,
    provider,
    email,
    user_id: userId,
    token_hash: props.hashed_token ?? null,
    email_otp: props.email_otp ?? null,
    action_link: props.action_link ?? null,
  };
}

/**
 * Lazarus product login — end users never visit the Supabase dashboard.
 * Google/HubSpot/Salesforce use Lazarus OAuth; email uses magic link.
 */
export function registerAuthRoutes(app: Express): void {
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
        email_confirm: true,
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

      res.json({ ok: true, user_id: created.data.user.id, email });
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
   * Password reset — mint a recovery token via service role (no inbox required).
   * Avoids Supabase Auth email rate limits that block resetPasswordForEmail.
   * Best-effort email is still attempted when the mailer is available.
   */
  app.post("/api/auth/password-reset", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Enter a valid work email." });
      return;
    }

    const admin = adminAuth();
    if (!admin) {
      res.status(503).json({
        error: "Password reset requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      });
      return;
    }

    try {
      const redirectTo = `${resolveFrontendOrigin().replace(/\/$/, "")}/?lazarus_reset=1`;
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (link.error) {
        const msg = link.error.message ?? "Password reset failed";
        // Do not reveal whether the email exists.
        if (/not found|unable to find|user not found/i.test(msg)) {
          res.json({
            ok: true,
            emailed: false,
            message: "If that email has an account, you can set a new password next.",
          });
          return;
        }
        throw link.error;
      }

      const props = link.data.properties as {
        hashed_token?: string;
        email_otp?: string;
        action_link?: string;
      };

      // Best-effort inbox delivery (often rate-limited on free Supabase).
      let emailed = false;
      let emailError: string | null = null;
      const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
      const url = (process.env.SUPABASE_URL ?? "").trim();
      if (url && anonKey) {
        const pub = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const sent = await pub.auth.resetPasswordForEmail(email, { redirectTo });
        emailed = !sent.error;
        if (sent.error) {
          emailError = sent.error.message;
          console.warn("[auth-password-reset] email send:", sent.error.message);
        }
      }

      if (!props.hashed_token && !emailed) {
        res.status(503).json({
          error:
            emailError && /rate limit/i.test(emailError)
              ? "Email rate limit exceeded — wait about an hour, or restart the API with SUPABASE_SERVICE_ROLE_KEY so Lazarus can reset without email."
              : (emailError ?? "Could not start password reset. Try again later."),
        });
        return;
      }

      res.json({
        ok: true,
        emailed,
        email_error: emailError,
        token_hash: props.hashed_token ?? null,
        action_link: props.action_link ?? null,
        message: emailed
          ? "Check your email for a reset link."
          : "Continue to choose a new password.",
      });
    } catch (err) {
      console.error("[auth-password-reset]", err);
      const msg = err instanceof Error ? err.message : "Password reset failed";
      if (/rate limit/i.test(msg)) {
        res.status(429).json({
          error:
            "Email rate limit exceeded. Wait about an hour before requesting another reset email.",
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  /** After Google / HubSpot / Salesforce OAuth popup succeeds. */
  app.post("/api/auth/session-from-provider", async (req, res) => {
    const provider = String(req.body?.provider ?? "").trim().toLowerCase() as AuthProviderId;
    if (provider !== "google" && provider !== "hubspot" && provider !== "salesforce") {
      res.status(400).json({ error: "provider must be google, hubspot, or salesforce" });
      return;
    }

    const email = emailForProvider(provider);
    if (!email) {
      const label =
        provider === "google" ? "Google" : provider === "hubspot" ? "HubSpot" : "Salesforce";
      res.status(401).json({
        error: `Connect ${label} first (approve the popup), then try again.`,
      });
      return;
    }

    try {
      const payload = await mintSessionPayload(email, provider);
      res.json(payload);
    } catch (err) {
      console.error("[auth-provider-bridge]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Sign-in failed",
      });
    }
  });

  /** Back-compat alias used by older clients. */
  app.post("/api/auth/session-from-crm", async (req, res) => {
    const provider = String(req.body?.provider ?? "").trim().toLowerCase();
    req.body = { ...req.body, provider };
    // Reuse handler by forwarding
    const email =
      provider === "hubspot" || provider === "salesforce" || provider === "google"
        ? emailForProvider(provider as AuthProviderId)
        : null;
    if (!email) {
      res.status(401).json({ error: "Connect the provider first, then retry Sign in." });
      return;
    }
    try {
      res.json(await mintSessionPayload(email, provider as AuthProviderId));
    } catch (err) {
      console.error("[auth-crm-bridge]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "CRM session bridge failed",
      });
    }
  });

  /**
   * Email sign-in for Lazarus.
   * Always mints a one-time session token so login works even when Supabase mailer
   * is not configured. Optionally also emails a magic link when OTP send succeeds.
   * Set AUTH_REQUIRE_EMAIL_DELIVERY=true to refuse sign-in unless the email was sent.
   */
  app.post("/api/auth/email-magic-link", async (req, res) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Enter a valid work email." });
      return;
    }

    const admin = adminAuth();
    if (!admin) {
      res.status(503).json({
        error: "Email login requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      });
      return;
    }

    try {
      const redirectTo = resolveFrontendOrigin();
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const users = (listed.data?.users ?? []) as Array<{ id: string; email?: string | null }>;
      const found = users.find((u) => u.email?.toLowerCase() === email);
      if (!found) {
        const created = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          app_metadata: { login_provider: "email" },
        });
        if (created.error && !/already/i.test(created.error.message)) {
          throw created.error;
        }
      }

      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (link.error) throw link.error;

      const props = link.data.properties as {
        hashed_token?: string;
        email_otp?: string;
        action_link?: string;
      };

      if (!props.hashed_token && !props.email_otp) {
        throw new Error("Could not mint a Lazarus sign-in token.");
      }

      // Best-effort inbox delivery (often disabled / rate-limited on free Supabase).
      const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
      const url = (process.env.SUPABASE_URL ?? "").trim();
      let emailed = false;
      let emailError: string | null = null;
      if (url && anonKey) {
        const pub = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const otp = await pub.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
        });
        emailed = !otp.error;
        if (otp.error) {
          emailError = otp.error.message;
          console.warn("[auth-email] OTP send:", otp.error.message);
        }
      }

      const requireDelivery =
        (process.env.AUTH_REQUIRE_EMAIL_DELIVERY ?? "").trim().toLowerCase() === "true";
      if (requireDelivery && !emailed) {
        res.status(503).json({
          error:
            emailError ??
            "Email delivery is required but the magic link could not be sent. Configure Supabase Auth email/SMTP.",
        });
        return;
      }

      res.json({
        ok: true,
        emailed,
        // Client completes the session immediately with token_hash (no inbox required).
        token_hash: props.hashed_token ?? null,
        email_otp: props.email_otp ?? null,
        message: emailed
          ? "Signed in. A backup link was also emailed to you."
          : "Signed in with your email.",
        ...(props.action_link ? { action_link: props.action_link } : {}),
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
