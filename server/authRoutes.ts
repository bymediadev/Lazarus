import type { Express } from "express";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseAuthConfigured } from "./authMiddleware.js";
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
        ? "Lazarus login ready — Google/HubSpot/Salesforce via app OAuth; email magic link."
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
   * Email magic link for Lazarus login.
   * Prefer server-side generateLink + invite so we don't depend on dashboard Google settings.
   * Uses Supabase's built-in mailer when available; in development also returns action_link.
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
      // Ensure user exists (confirmed) so magic link always works.
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
        action_link?: string;
      };

      // Ask GoTrue to send the email when possible (same as client OTP).
      const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
      const url = (process.env.SUPABASE_URL ?? "").trim();
      let emailed = false;
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
          console.warn("[auth-email] OTP send:", otp.error.message);
        }
      }

      const isDev = process.env.NODE_ENV !== "production";
      res.json({
        ok: true,
        emailed,
        message: emailed
          ? "Check your email for the Lazarus sign-in link."
          : isDev && props.action_link
            ? "Email send unavailable — use the local sign-in link below."
            : "If email delivery is enabled, check your inbox for the Lazarus sign-in link.",
        // Local/dev convenience only — never expose in production responses.
        ...(isDev && props.action_link ? { action_link: props.action_link } : {}),
        ...(isDev && props.hashed_token ? { token_hash: props.hashed_token } : {}),
      });
    } catch (err) {
      console.error("[auth-email]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Could not start email sign-in",
      });
    }
  });
}
