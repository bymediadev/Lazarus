# Host Lazarus Deal Recovery

Production is a **split**: GitHub Pages serves the website; Render runs the API. Locally, `npm run dev` still runs both together.

## Production

| Piece | Host | URL |
|-------|------|-----|
| Marketing site, login, `/portal` | GitHub Pages | `https://www.getldr.ca` |
| `/api/*` (Gemini, Stripe, OAuth callbacks, contact) | Render | `https://lazarus-4uxi.onrender.com` and `https://api.getldr.ca` |

PHP-only shared hosting (Bluehost / GoDaddy cPanel) cannot run the API.

The Pages site does not sleep. Public checkout is Stripe Payment Links, so **Buy** / **Subscribe** do not wait on Render. The API on Free still spins down after 15 minutes idle — analyses, OAuth, webhooks, and attaching a paid plan after signup can wait on a cold start until you move this service to a paid instance.

### GitHub secrets (Pages build)

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|--------|
| `VITE_API_URL` | Optional — workflow defaults to `https://lazarus-4uxi.onrender.com` |
| `VITE_LAZARUS_API_KEY` | Same string as Render `LAZARUS_API_KEY` (required if that key is set on Render) |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (public anon key) |
| `VITE_TURNSTILE_SITE_KEY` | Optional. Same as Render `TURNSTILE_SITE_KEY` so the widget can render while the API is cold |

Push to `main` runs tests, then `npm run build:pages` and deploys `dist/`.

### Render env

Keep existing API secrets. Set:

```
FRONTEND_ORIGIN=https://www.getldr.ca,https://getldr.ca,http://localhost:5173
PUBLIC_API_URL=https://api.getldr.ca
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

Leave `VITE_API_URL` unset on Render. CORS also allows `www.getldr.ca` in code even if this env is stale.

OAuth callbacks should use `https://api.getldr.ca` (Google requires an authorized domain you own). Keep `https://lazarus-4uxi.onrender.com` enabled as the Render subdomain until every provider dashboard is updated.

### API hostname (`api.getldr.ca`)

1. Render → Lazarus → Settings → Custom Domains → `api.getldr.ca` (already added).
2. GoDaddy DNS for `getldr.ca`:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| CNAME | `api` | `lazarus-4uxi.onrender.com` | 1 Hour |

3. In Render, click **Verify** on `api.getldr.ca`. Wait for Certificate Issued.
4. Set `PUBLIC_API_URL=https://api.getldr.ca` and `GOOGLE_REDIRECT_URI=https://api.getldr.ca/api/integrations/google/callback`, then add that URI on the Google OAuth client.

Do **not** point `www` or apex at Render — those stay on GitHub Pages.

### DNS cutover (GoDaddy)

Do this **after** a green Pages deploy. Until then, leave DNS on Render so the live site stays up.

Nameservers are GoDaddy (`ns67` / `ns68.domaincontrol.com`). Today `www` is a CNAME to `lazarus-4uxi.onrender.com` and the apex `A` record is Render (`216.24.57.1`).

**Do not touch MX, TXT, or Zoho verify CNAMEs** — those are email.

1. Sign in at [GoDaddy](https://www.godaddy.com) → **My Products** → **Domains** → `getldr.ca` → **DNS** (DNS Records).
2. Find the **www** CNAME (currently `lazarus-4uxi.onrender.com`). Click **Edit**. Set:
   - Type: `CNAME`
   - Name: `www`
   - Value: `bymediadev.github.io`
   - TTL: 1 Hour  
   Save. Do **not** put `https://` or `/Lazarus` in the value.
3. Find every **A** record whose Name is `@` (the one pointing at `216.24.57.1` / Render). Delete extras, then add **four** A records:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| A | `@` | `185.199.108.153` | 1 Hour |
| A | `@` | `185.199.109.153` | 1 Hour |
| A | `@` | `185.199.110.153` | 1 Hour |
| A | `@` | `185.199.111.153` | 1 Hour |

4. If GoDaddy has **Forwarding** on `getldr.ca` or `www`, turn it off. GitHub handles `getldr.ca` → `www.getldr.ca`.
5. Wait 5–30 minutes (sometimes up to 24 hours). Then GitHub → Lazarus repo → **Settings → Pages**: custom domain `www.getldr.ca` should verify. Check **Enforce HTTPS**.

Supabase Auth → URL configuration: Site URL `https://www.getldr.ca`, plus redirect `https://www.getldr.ca/?lazarus_reset=1`.

After HTTPS works on Pages, drop `www.getldr.ca` / `getldr.ca` from Render custom domains so Render is API-only.

## Local

```bash
cp .env.example .env   # add GEMINI_API_KEY; add OPENROUTER_API_KEY for $0 failover
npm install
npm run dev            # UI http://localhost:5173 · API http://localhost:3001
```

Leave `VITE_API_URL` unset so Vite proxies `/api` to port 3001.

| Path | What visitors get |
|------|-------------------|
| `/` | Public landing page |
| `/login` | Sign in / create account |
| `/portal` or `/app` | Lazarus Deal Recovery tool |
| `/api/*` | Backend (Render in production) |

## One-process fallback (Render or any Node box)

`npm run build` then `npm start` still serves the UI from `dist/` and `/api` from the same process. Useful as a rollback if Pages/DNS is wrong. Bind `0.0.0.0:$PORT`.

```bash
npm install
npm run build
NODE_ENV=production npm start
```

On a VPS, put nginx in front for HTTPS and proxy to `127.0.0.1:3001`.

## Environment

Copy [`.env.example`](../.env.example). Minimum for a usable API:

- `GEMINI_API_KEY` (or a free `OPENROUTER_API_KEY` — see [llm-failover.md](./llm-failover.md))
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` = `https://www.getldr.ca` plus localhost for local OAuth
- `PUBLIC_API_URL` = `https://lazarus-4uxi.onrender.com`

Stripe, Zoom, HubSpot, etc. stay optional until you need those features. See [auth-setup.md](./auth-setup.md) and [billing-setup.md](./billing-setup.md).
