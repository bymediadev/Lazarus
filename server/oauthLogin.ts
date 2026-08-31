import { createClient } from "@supabase/supabase-js";
import type { LoginCodeSession, LoginTicketProvider } from "./loginTickets.js";
import { claimPaidCheckout } from "./billing.js";

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findUserIdByEmail(
  admin: NonNullable<ReturnType<typeof adminAuth>>,
  email: string
): Promise<string | undefined> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = (listed.data?.users ?? []) as Array<{ id: string; email?: string | null }>;
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return undefined;
}

/**
 * After a successful OAuth callback: create/find the user and mint a Supabase
 * session on the server. hashed_token never leaves this process.
 */
export async function createVerifiedSupabaseSession(
  email: string,
  provider: LoginTicketProvider
): Promise<LoginCodeSession> {
  const admin = adminAuth();
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!admin || !url || !anonKey) {
    throw new Error("Login requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const trimmed = email.trim().toLowerCase();
  let userId = await findUserIdByEmail(admin, trimmed);
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: trimmed,
      email_confirm: true,
      app_metadata: { login_provider: provider },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Failed to create Lazarus user");
    }
    userId = created.data.user.id;
  }

  try {
    await claimPaidCheckout({ id: userId, email: trimmed }, {});
  } catch (err) {
    console.warn("[oauth-login-billing]", err instanceof Error ? err.message : err);
  }

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: trimmed,
  });
  if (link.error) throw link.error;
  const hashed = (link.data.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!hashed) throw new Error("Could not mint a server-side sign-in session.");

  const pub = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await pub.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  });
  if (verified.error || !verified.data.session) {
    throw verified.error ?? new Error("Could not verify the OAuth login session.");
  }

  const session = verified.data.session;
  return {
    userId,
    email: trimmed,
    provider,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: new Date(session.expires_at ? session.expires_at * 1000 : Date.now() + 3600_000).toISOString(),
  };
}
