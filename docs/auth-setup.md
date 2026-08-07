## Auth setup (Lazarus login)

End users sign into **Lazarus Deal Recovery** — not the Supabase website. Supabase is only the session store behind the API.

### How login works

| Button | Flow |
|--------|------|
| **Email** | Lazarus API mints a magic link (and emails it when mail is available) |
| **Google** | Existing Lazarus Google OAuth popup → session |
| **HubSpot / Salesforce** | Existing CRM OAuth popup → session |

No Supabase Auth “Google provider” dashboard setup is required for Google login.

### Local env

```env
VITE_SUPABASE_URL=https://mbuoldzmzurydulfcxbi.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Restart `npm run dev` after changing `VITE_*`.

### Render

Set the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (build-time) plus server `SUPABASE_*` keys, then redeploy.

### Optional URL allow-list

If magic-link redirects fail, add your app origins under Supabase → Authentication → URL Configuration (Site URL + Redirect URLs). Users still never log into that dashboard.
