## Auth setup (Lazarus login)

End users sign into **Lazarus Deal Recovery** — not the Supabase website. Supabase Auth stores accounts (`auth.users`) with email + password; the app also supports Google / HubSpot / Salesforce OAuth popups.

### How login works

| Path | Flow |
|------|------|
| **Sign in / Create account** | Email + password → Supabase Auth (`signInWithPassword` / server `createUser`) |
| **Forgot password** | Supabase reset email (needs SMTP / mailer configured) |
| **Account portal** | Signed-in users: view email, change password, sign out |
| **Google / HubSpot / Salesforce** | Existing Lazarus OAuth popup → session bridge |

Passwords live in Supabase Auth (hashed). Changing password uses the signed-in session (`updateUser({ password })`).

### Local env

```env
VITE_SUPABASE_URL=https://mbuoldzmzurydulfcxbi.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Restart `npm run dev` after changing `VITE_*`.

### Render

Server already has `SUPABASE_URL` / keys. After deploy, the UI loads anon credentials from
`GET /api/auth/public-config` (no rebuild required for `VITE_*`).

| Key | Notes |
|-----|--------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `SUPABASE_ANON_KEY` | Required for `/api/auth/public-config` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — never `VITE_`; required for `/api/auth/signup` |

### Optional URL allow-list

If password-reset redirects fail, add your app origins under Supabase → Authentication → URL Configuration (Site URL + Redirect URLs). Users still never log into that dashboard.

---

## Ops Command Center (founder / part-time hire)

Ops users land on an **issues-first command center** after login (not the customer Deal Recovery console). Use it to see hang-ups, copy a diagnosis packet into Cursor, look up a user by email when someone contacts you, and check system health.

### Grant yourself (or a hire) access

1. They must have a Lazarus login (sign up once in the product).
2. Grant role:

```bash
node --env-file=.env scripts/set-founder.mjs you@company.com founder
# later, for a part-time technical hire:
node --env-file=.env scripts/set-founder.mjs hire@company.com ops
```

3. On Render (and local `.env`), set allowlists:

```env
FOUNDER_EMAILS=you@company.com
OPS_EMAILS=hire@company.com
FOUNDER_ALERT_EMAILS=you@company.com,hire@company.com
```

`FOUNDER_EMAILS` and `OPS_EMAILS` both unlock the command center. `FOUNDER_ALERT_EMAILS` receives morning / afternoon / evening status emails (and CRITICAL break-throughs).

4. Apply SQL migration [`supabase/migrations/010_founder_ops.sql`](../supabase/migrations/010_founder_ops.sql) in the Supabase SQL editor (creates `api_events`, audit, alert state, notes).

5. Optional email delivery (Resend):

```env
RESEND_API_KEY=re_...
FOUNDER_ALERT_FROM=Lazarus Ops <onboarding@resend.dev>
FOUNDER_ALERT_TZ=America/New_York
FOUNDER_ALERT_HOURS=8,13,20
```

GitHub Actions workflows `founder-ops-digests.yml` and `founder-ops-critical.yml` call `/api/founder/alerts/digest` and `/api/founder/alerts/run` with the same `PURGE_CRON_SECRET` / `LAZARUS_API_URL` secrets as retention purge.

From System tab in the command center you can send a **test digest** (requires Resend + allowlist).

### Adding a second ops person later

1. They create a Lazarus account.
2. `node --env-file=.env scripts/set-founder.mjs their@email.com ops`
3. Add their email to `OPS_EMAILS` and `FOUNDER_ALERT_EMAILS` on Render → restart/redeploy.
4. Same thrice-daily emails and same HQ — no new product build.

