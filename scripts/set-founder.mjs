/**
 * Grant founder or ops role on a Supabase Auth user.
 *
 * Usage:
 *   node --env-file=.env scripts/set-founder.mjs you@company.com
 *   node --env-file=.env scripts/set-founder.mjs hire@company.com ops
 */
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const roleArg = (process.argv[3] ?? "founder").trim().toLowerCase();
const role = roleArg === "ops" ? "ops" : "founder";

if (!email || !email.includes("@")) {
  console.error("Usage: node --env-file=.env scripts/set-founder.mjs <email> [founder|ops]");
  process.exit(1);
}

const url = (process.env.SUPABASE_URL ?? "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = null;
for (let page = 1; page <= 10; page++) {
  const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
  const hit = (listed.data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (hit) {
    userId = hit.id;
    break;
  }
  if ((listed.data?.users?.length ?? 0) < 200) break;
}

if (!userId) {
  console.error(`No auth user found for ${email}. Have them sign up in Lazarus first.`);
  process.exit(1);
}

const { data: existing, error: getErr } = await admin.auth.admin.getUserById(userId);
if (getErr || !existing.user) {
  console.error(getErr?.message ?? "getUserById failed");
  process.exit(1);
}

const app_metadata = {
  ...(existing.user.app_metadata ?? {}),
  role,
};

const { data, error } = await admin.auth.admin.updateUserById(userId, { app_metadata });
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`OK — ${data.user.email} role=${role} id=${data.user.id}`);
console.log("Also add their email to OPS_EMAILS / FOUNDER_EMAILS and FOUNDER_ALERT_EMAILS on Render.");
