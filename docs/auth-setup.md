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
