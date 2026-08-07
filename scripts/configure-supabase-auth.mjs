/**
 * Configure Supabase Auth URLs + Email + Google via Management API.
 *
 * Requires:
 *   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
 *   SUPABASE_URL or PROJECT_REF (default: mbuoldzmzurydulfcxbi)
 * Optional for Google:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (from .env)
 *
 * Usage: node --env-file=.env scripts/configure-supabase-auth.mjs
 */
import "dotenv/config";

const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const projectRef =
  (process.env.SUPABASE_PROJECT_REF ?? "").trim() ||
  (process.env.SUPABASE_URL ?? "")
    .replace(/^https:\/\//, "")
    .replace(/\.supabase\.co.*$/, "") ||
  "mbuoldzmzurydulfcxbi";

if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\nCreate one at https://supabase.com/dashboard/account/tokens\nthen: set SUPABASE_ACCESS_TOKEN=sbp_... && node --env-file=.env scripts/configure-supabase-auth.mjs"
  );
  process.exit(1);
}

const siteUrl =
  (process.env.AUTH_SITE_URL ?? "").trim() ||
  (process.env.PUBLIC_API_URL ?? "").trim() ||
  "https://lazarus-4uxi.onrender.com";

const redirectUrls = [
  "http://localhost:5173",
  "http://localhost:5173/**",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5173/**",
  siteUrl,
  `${siteUrl.replace(/\/$/, "")}/**`,
].join(",");

const body = {
  site_url: siteUrl,
  uri_allow_list: redirectUrls,
  external_email_enabled: true,
  mailer_autoconfirm: false,
};

const googleId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const googleSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
if (googleId && googleSecret) {
  body.external_google_enabled = true;
  body.external_google_client_id = googleId;
  body.external_google_secret = googleSecret;
}

const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Auth config failed (${res.status}):`, text.slice(0, 800));
  process.exit(1);
}

console.log("Supabase Auth config updated.");
console.log(`  project: ${projectRef}`);
console.log(`  site_url: ${siteUrl}`);
console.log(`  email: enabled`);
console.log(
  `  google: ${googleId ? "enabled (using GOOGLE_CLIENT_ID)" : "skipped — no GOOGLE_CLIENT_* in env"}`
);
console.log(
  "\nStill required in Google Cloud Console:\n  Authorized redirect URI =\n  https://" +
    projectRef +
    ".supabase.co/auth/v1/callback"
);
