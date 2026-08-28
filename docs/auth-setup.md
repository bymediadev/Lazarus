## Auth setup (Lazarus login)

End users sign into **Lazarus Deal Recovery** — not the Supabase website. Supabase Auth stores accounts (`auth.users`) with email + password; the app also supports Google / HubSpot / Salesforce OAuth popups.

### How login works

| Path | Flow |
|------|------|
| **Sign in / Create account** | Optional — header **Login** / **Sign up** open a portal. Guests get **5 free analyses**, then must sign up to continue. Analyses save only when signed in. |
| **Forgot password** | Server mints a recovery session (bypasses inbox rate limits) → **Save new password** screen. Best-effort email still attempted when the mailer allows it. |
| **Account portal** | Signed-in users: view email, change password, sign out |
| **Google / HubSpot / Salesforce** | Existing Lazarus OAuth popup → session bridge |

### Guest freemium

| Who | Cap | Persist |
|-----|-----|---------|
| Guest (not logged in) | 5 analyses (client), then lock | No |
| Signed-in free user | Same freemium cap (client + soft daily API limit) | Yes |
| **Founder only** (`joshua.bennett003@gmail.com`) / ops role | **Unlimited** — use this account for demos | Yes |
| Demo machine | `?demo=1` (tab session) or `VITE_GUEST_USAGE_BYPASS=true` | Unlocks that browser tab |

No other email skips the free-analysis blocker. Anonymous soft-limit ~10/day per IP+UA (`GUEST_ANALYSIS_DAILY_LIMIT`); signed-in non-founder accounts get a per-user daily soft-limit. Production demo header bypass requires `GUEST_USAGE_DEMO_BYPASS=true`.

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

### GitHub Pages + Render

Server already has `SUPABASE_URL` / keys. The Pages UI can bake `VITE_SUPABASE_*` at build time, or load anon credentials from
`GET /api/auth/public-config` on the Render API.

| Key | Notes |
|-----|--------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `SUPABASE_ANON_KEY` | Required for `/api/auth/public-config` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — never `VITE_`; required for `/api/auth/signup` |

### Optional URL allow-list

If password-reset redirects fail, add your app origins under Supabase → Authentication → URL Configuration (Site URL + Redirect URLs), including `http://localhost:5173/?lazarus_reset=1` and `https://www.getldr.ca/?lazarus_reset=1`. Users still never log into that dashboard.

After the email link opens Lazarus, you should see a **Save new password** screen (not the main product). Request a fresh reset link after deploying this fix — older links may not include the reset hint.

### Saved deals & lifecycle (Entry and Team)

After login, analyses are **saved** on the account at every plan (including free). **My deals** in the header is the lifecycle tracker:

- **Entry ($99/mo) and Team ($499/mo):** deal threads, stalled vs unstuck, CRM hooks, timeline deltas
- **Free and $10/report:** button still opens; UI asks them to subscribe. History is waiting after upgrade.

Guests still analyze without persisting; sign in to save.

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

After you sign in with an allowlisted account, Lazarus opens **Founder Ops Command Center** by default (Overview / Issues / Lookup / System). From the product console, use **Under the hood** in the header to return. Only that account (and other ops emails you add) see this button.

4. Apply SQL migration [`supabase/migrations/010_founder_ops.sql`](../supabase/migrations/010_founder_ops.sql) in the Supabase SQL editor (creates `api_events`, audit, alert state, notes).

5. Optional email delivery (Resend):

```env
RESEND_API_KEY=re_...
FOUNDER_ALERT_FROM=Lazarus Ops <onboarding@resend.dev>
FOUNDER_ALERT_TZ=America/New_York
FOUNDER_ALERT_HOURS=8,13,20
```

### APIs & usage tab

In Ops HQ, open **APIs & usage** for a single consolidated view:

- Which providers are **out / degraded** (live probes for Gemini, AssemblyAI + config for CRM/DB)
- Whether failure **categories shifted** vs the prior week (AI / Auth / CRM / Quota / Network)
- **Billing / end-of-usage** signals (Gemini 429s, volume spikes)
- 7-day usage series and per-provider status

GitHub Actions workflows `founder-ops-digests.yml` and `founder-ops-critical.yml` call `/api/founder/alerts/digest` and `/api/founder/alerts/run` with the same `PURGE_CRON_SECRET` / `LAZARUS_API_URL` secrets as retention purge.

From System tab in the command center you can send a **test digest** (requires Resend + allowlist).

### Adding a second ops person later

1. They create a Lazarus account.
2. `node --env-file=.env scripts/set-founder.mjs their@email.com ops`
3. Add their email to `OPS_EMAILS` and `FOUNDER_ALERT_EMAILS` on Render → restart/redeploy.
4. Same thrice-daily emails and same HQ — no new product build.

