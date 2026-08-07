import type { Express } from "express";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseAuthConfigured } from "./authMiddleware.js";
import { loadHubSpotTokens } from "./integrations/hubspot/tokens.js";
import { loadSalesforceTokens } from "./integrations/salesforce/tokens.js";

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * After HubSpot/Salesforce OAuth, mint a Supabase session for the CRM account email.
 * Requires SUPABASE_SERVICE_ROLE_KEY. Used for “Sign in with HubSpot / Salesforce”.
 */
export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/status", (_req, res) => {
    res.json({
      configured: isSupabaseAuthConfigured(),
      google: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      email: isSupabaseAuthConfigured(),
      hubspot_bridge: !!(adminAuth() && loadHubSpotTokens()?.account_email),
      salesforce_bridge: !!(adminAuth() && loadSalesforceTokens()?.account_email),
      vite_anon_required: true,
      note: isSupabaseAuthConfigured()
        ? "Supabase Auth available — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the UI."
        : "Add SUPABASE_URL + SUPABASE_ANON_KEY (and VITE_*) to enable login.",
    });
  });

  app.post("/api/auth/session-from-crm", async (req, res) => {
    const provider = String(req.body?.provider ?? "").trim().toLowerCase();
    if (provider !== "hubspot" && provider !== "salesforce") {
      res.status(400).json({ error: "provider must be hubspot or salesforce" });
      return;
    }

    const admin = adminAuth();
    if (!admin) {
      res.status(503).json({
        error: "CRM login bridge requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      });
      return;
    }

    const email =
      provider === "hubspot"
        ? loadHubSpotTokens()?.account_email?.trim()
        : loadSalesforceTokens()?.account_email?.trim();

    if (!email) {
      res.status(401).json({
        error: `Connect ${provider === "hubspot" ? "HubSpot" : "Salesforce"} first, then retry Sign in.`,
      });
      return;
    }

    try {
      const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const users = (existing.data?.users ?? []) as Array<{ id: string; email?: string | null }>;
      let userId = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

      if (!userId) {
        const created = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          app_metadata: { crm_provider: provider },
        });
        if (created.error || !created.data.user) {
          throw created.error ?? new Error("Failed to create user");
        }
        userId = created.data.user.id;
      }

      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (link.error) throw link.error;

      const props = link.data.properties as {
        hashed_token?: string;
        email_otp?: string;
        action_link?: string;
      };

      res.json({
        ok: true,
        provider,
        email,
        user_id: userId,
        // Client completes with verifyOtp({ type: 'magiclink', token_hash })
        token_hash: props.hashed_token ?? null,
        email_otp: props.email_otp ?? null,
        action_link: props.action_link ?? null,
      });
    } catch (err) {
      console.error("[auth-crm-bridge]", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "CRM session bridge failed",
      });
    }
  });
}
