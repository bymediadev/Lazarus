# Host the whole Lazarus site in one folder

The marketing site, login, saved-deal workspace, and analysis API are **one Node app**. After `npm run build`, `npm start` serves everything from a single process. Upload this repo (or a git clone) to a **Node.js** host — not PHP-only shared hosting.

## What will not work

**Bluehost / GoDaddy / HostGator shared (cPanel + PHP)** cannot run this stack. There is no PHP backend to FTP up.

Use one of these instead:

| Host | Why it fits |
|------|-------------|
| **Render** (current production) | Git push; build + start; already used at `lazarus-4uxi.onrender.com` |
| **Railway / Fly.io / DigitalOcean App Platform** | Same Node start command |
| **Bluehost VPS / Cloud / any VPS** | You install Node, upload the folder, run `npm start` behind nginx |
| **Static-only CDN** | Frontend files only — the API still needs Node somewhere |

## One-time upload (VPS or any Node box)

On the server, with Node 20+:

```bash
# 1. Put the project on the machine (git clone or unzip)
cd Lazarus
cp .env.example .env   # fill secrets — never commit .env

# 2. Install and build the website + API together
npm install
npm run build

# 3. Serve marketing + /app + /api on one port
NODE_ENV=production npm start
```

`npm start` listens on `PORT` (default `3001`). Point the host’s public URL at that port.

| Path | What visitors get |
|------|-------------------|
| `/` | Public landing page |
| `/login` | Sign in / create account |
| `/portal` or `/app` | Lazarus Deal Recovery tool |
| `/api/*` | Backend |

## Environment

Copy [`.env.example`](../.env.example) on the host. Minimum for a usable site:

- `GEMINI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_ORIGIN` = your public https origin (comma-separate localhost if you still develop locally)

Stripe, Zoom, HubSpot, etc. stay optional until you need those features. See [auth-setup.md](./auth-setup.md) and [billing-setup.md](./billing-setup.md).

## Render (easiest managed path)

Keep the existing Render web service:

- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- Env vars from `.env.example` in the Render dashboard

That is the same “upload once, everything loads” model — git is the upload.

## Process manager on a VPS

```bash
# example — keep the site up after SSH disconnects
npm install -g pm2
NODE_ENV=production pm2 start npm --name lazarus -- start
pm2 save
```

Put nginx (or Caddy) in front for HTTPS and proxy to `127.0.0.1:3001`.
