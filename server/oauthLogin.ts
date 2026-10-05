import { createClient, type User } from "@supabase/supabase-js";
import type { LoginCodeSession, LoginTicketProvider } from "./loginTickets.js";
import { claimPaidCheckout } from "./billing.js";
import { isOpsUser, opsEmailAllowlist, serviceRoleClient } from "./founderAuth.js";
import { decideOAuthLogin, OAuthLoginError } from "./oauthIdentity.js";

function adminAuth() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Collision check only. Never used to mint a session. */
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

async function identityUserId(provider: string, providerSub: string): Promise<string | null> {
  const sb = serviceRoleClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("user_identities")
    .select("user_id")
    .eq("provider", provider)
    .eq("provider_sub", providerSub)
    .maybeSingle();
  if (error) {
    console.warn("[oauth-identity]", error.message);
    return null;
  }
  return data?.user_id ? String(data.user_id) : null;
}

async function bindIdentity(provider: string, providerSub: string, userId: string): Promise<void> {
  const sb = serviceRoleClient();
  if (!sb) throw new Error("Login requires SUPABASE_SERVICE_ROLE_KEY.");
  const { error } = await sb.from("user_identities").insert({
    provider,
    provider_sub: providerSub,
    user_id: userId,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

async function userById(
  admin: NonNullable<ReturnType<typeof adminAuth>>,
  userId: string
): Promise<User | null> {
  const loaded = await admin.auth.admin.getUserById(userId);
  return loaded.data.user ?? null;
}

/**
 * After a successful OAuth callback: bind provider+subject and mint a Supabase
 * session on the server. hashed_token never leaves this process.
 */
export async function createVerifiedSupabaseSession(input: {
  email: string;
  emailVerified: boolean;
  provider: LoginTicketProvider;
  providerSub: string;
}): Promise<LoginCodeSession> {
  const admin = adminAuth();
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!admin || !url || !anonKey) {
    throw new Error("Login requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const email = input.email.trim().toLowerCase();
  const providerSub = input.providerSub.trim();
  const boundUserId = await identityUserId(input.provider, providerSub);
  let identityIsOps = false;
  if (boundUserId) {
    const bound = await userById(admin, boundUserId);
    identityIsOps = isOpsUser(bound);
  }
  const emailOwnerUserId = boundUserId ? null : ((await findUserIdByEmail(admin, email)) ?? null);
  const decision = decideOAuthLogin({
    emailVerified: input.emailVerified,
    providerSub,
    email,
    opsEmails: [...opsEmailAllowlist()],
    identityUserId: boundUserId,
    identityIsOps,
    emailOwnerUserId,
  });
  if (!decision.ok) throw new OAuthLoginError(decision.reason);

  let userId = decision.mode === "existing" ? decision.userId : "";
  if (decision.mode === "create") {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { login_provider: input.provider },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("Failed to create Lazarus user");
    }
    userId = created.data.user.id;
    if (isOpsUser(created.data.user)) {
      await admin.auth.admin.deleteUser(userId);
      throw new OAuthLoginError("ops_password_only");
    }
    await bindIdentity(input.provider, providerSub, userId);
  }

  const account = await userById(admin, userId);
  if (!account?.email) throw new Error("OAuth account is missing an email.");
  if (isOpsUser(account)) throw new OAuthLoginError("ops_password_only");
  const sessionEmail = account.email.trim().toLowerCase();

  try {
    await claimPaidCheckout(
      { id: userId, email: sessionEmail },
      { emailConfirmed: true }
    );
  } catch (err) {
    console.warn("[oauth-login-billing]", err instanceof Error ? err.message : err);
  }

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: sessionEmail,
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
    email: sessionEmail,
    provider: input.provider,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: new Date(session.expires_at ? session.expires_at * 1000 : Date.now() + 3600_000).toISOString(),
  };
}
