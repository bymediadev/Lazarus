# Host Lazarus Deal Recovery

Production is a **split**: GitHub Pages serves the website; Render runs the API. Locally, `npm run dev` still runs both together.

## Production

| Piece | Host | URL |
|-------|------|-----|
| Marketing site, login, `/portal` | GitHub Pages | `https://www.getldr.ca` |
| `/api/*` (Gemini, Stripe, OAuth callbacks, contact) | Render | `https://lazarus-4uxi.onrender.com` |

PHP-only shared hosting (Bluehost / GoDaddy cPanel) cannot run the API.

The Pages site does not sleep. The Render **free** API still spins down after about 15 minutes idle — open `/api/health` once before a demo.

### GitHub secrets (Pages build)

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|--------|
| `VITE_API_URL` | Optional — workflow defaults to `https://lazarus-4uxi.onrender.com` |
| `VITE_LAZARUS_API_KEY` | Same string as Render `LAZARUS_API_KEY` (required if that key is set on Render) |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (public anon key) |

Push to `main` runs tests, then `npm run build:pages` and deploys `dist/`.

### Render env

Keep existing API secrets. Set:

```
FRONTEND_ORIGIN=https://www.getldr.ca,https://getldr.ca,http://localhost:5173
PUBLIC_API_URL=https://lazarus-4uxi.onrender.com
```

Leave `VITE_API_URL` unset on Render. CORS also allows `www.getldr.ca` in code even if this env is stale.

OAuth callback URLs stay on the Render host (already registered). After login/Stripe, users return to `https://www.getldr.ca`.

### DNS cutover (custom domain)

Do this **after** a green Pages deploy. Until then, leave DNS on Render so the live site stays up.

At your DNS host, replace Render records with:

| Host | Type | Value |
|------|------|--------|
| `www` | CNAME | `bymediadev.github.io` |
| `@` (apex `getldr.ca`) | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |

Remove Render/CNAME-to-onrender records for `www` and the apex. Then in GitHub → repo → Settings → Pages: confirm custom domain `www.getldr.ca` and **Enforce HTTPS**.

Supabase Auth → URL configuration: Site URL `https://www.getldr.ca`, plus redirect `https://www.getldr.ca/?lazarus_reset=1`.

After HTTPS works on Pages, you can drop `www.getldr.ca` / `getldr.ca` from the Render custom-domain list (`render.yaml` `domains:`) so Render is API-only.

## Local

```bash
cp .env.example .env   # add GEMINI_API_KEY (AIza… or AQ.… format)
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

- `GEMINI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` = `https://www.getldr.ca` plus localhost for local OAuth
- `PUBLIC_API_URL` = `https://lazarus-4uxi.onrender.com`

Stripe, Zoom, HubSpot, etc. stay optional until you need those features. See [auth-setup.md](./auth-setup.md) and [billing-setup.md](./billing-setup.md).
