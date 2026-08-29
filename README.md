# Lazarus Deal Recovery

Judgment layer for sales managers and VPs: which stalled deals will close, which are recoverable vs a flat no, and what to do next. Gemini extracts evidence; `server/scoring.ts` computes viability, DRI, and trajectory. Humans decide.

Never commit secrets (`.env`, `.data/`, API keys). Use `.env.example` as the template.

Full doc map: [`docs/README.md`](docs/README.md)

---

## Quick start

```bash
cp .env.example .env   # add GEMINI_API_KEY (AIza… or AQ.… format)
npm install
npm run dev            # UI http://localhost:5173 · API http://localhost:3001
```

On Windows, always use `npm run dev` (includes `node --use-system-ca` for Gemini TLS).

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Full stack (API + UI) |
| `npm run test` | Scoring, grounding, pipeline, document/email, HubSpot, env check |
| `npm run test:stress-deep-context` | Extended deep-context POST against local API |
| `npm run purge:retention` | Null `transcript_text` older than `DATA_RETENTION_DAYS` |
| `npm run cleanup:ports` | Free local ports if a prior `dev` hung |

---

## Architecture

```
Evidence → Gemini (extract) → grounding.ts → scoring.ts (DRI) → Supabase → UI
```

| Layer | Role |
|-------|------|
| 1 | LLM extraction only (no scores in model output) |
| 2 | Deterministic compiler (`server/scoring.ts`) |
| 3 | Read-only UI projection |

---

## Database (Supabase)

Apply in SQL Editor, in order:

1. `supabase/setup.sql` (or existing schema)
2. `supabase/migrations/003_enterprise_rls.sql`
3. `supabase/migrations/004_retention_purge.sql`
4. `supabase/migrations/005_lockdown_security_definer_rpc.sql`
5. `supabase/migrations/006_rescue_outcomes.sql`
6. `supabase/migrations/007_purge_audit_log.sql`
7. `supabase/migrations/008_ingest_metadata.sql`

Server writes use `SUPABASE_SERVICE_ROLE_KEY` — never expose it to the frontend.

### Retention purge (GitHub Actions)

Workflow: `.github/workflows/purge-retention.yml` (daily 03:00 UTC) → `POST /api/admin/purge-retention` with header `x-cron-secret`.

| GitHub secret | Meaning |
|---------------|---------|
| `LAZARUS_API_URL` | Production API base (e.g. `https://your-app.onrender.com`) |
| `PURGE_CRON_SECRET` | Same value as `PURGE_CRON_SECRET` on the API |

---

## Trust Pack

Customer-facing legal/security pages (source in `public/`):

| ID | Doc | Path |
|----|-----|------|
| PP-001 | Privacy Policy | `/privacy` |
| ToS-001 | Terms of Service | `/terms` |
| DPA-001 | Data Processing Addendum | `/dpa` |
| SEC-001 | Security Overview | `/security-overview` |

Founder-only sales enablement (owner: `joshua.bennett003@gmail.com`; Bearer auth required; open from Founder Ops):

| ID | Doc | Path |
|----|-----|------|
| SEC-002 | Security Battlecard | `/api/trust-pack/battlecard` |

Legacy HTML paths (e.g. `/privacy.html`) and `/api/trust-pack/{privacy,terms,dpa,security-overview}` still work; HTML paths 301 to the canonical URLs above.

---

## Deploy (GitHub Pages + Render API)

The public site is a static Vite build on **GitHub Pages** (`www.getldr.ca`). The Express API stays on **Render** (`https://lazarus-4uxi.onrender.com`). Push to `main` runs tests, then deploys `dist/` to Pages. PHP-only shared hosting will not run the API — see [`docs/hosting.md`](docs/hosting.md).

`npm run build` then `npm start` still serves site + API from one Node process (local, VPS, or Render fallback).

| Layer | Setting | Value |
|-------|---------|-------|
| **Pages** (site) | Build | `npm run build:pages` with `VITE_API_URL` + `VITE_*` secrets |
| **Render** (API) | Build | `npm install && npm run build` |
| **Render** (API) | Start | `npm start` |
| **Render** (API) | Health | `/api/health` |
| **Render** (API) | Blueprint | `render.yaml` (optional) |

Required env (copy from local `.env`): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PURGE_CRON_SECRET`, `DATA_RETENTION_DAYS`, `NODE_ENV=production`, `FRONTEND_ORIGIN` (include `https://www.getldr.ca`), `PUBLIC_API_URL`, `LAZARUS_API_KEY`. GitHub Pages bakes `VITE_API_URL=https://lazarus-4uxi.onrender.com` plus `VITE_LAZARUS_API_KEY` / `VITE_SUPABASE_*` at build time. Local `npm run dev` leaves `VITE_API_URL` unset (Vite proxies `/api`).

The marketing pages stay up on GitHub Pages. Pricing CTAs are Stripe Payment Links, so checkout does not wait on the Render API. Analyses, webhooks, and claiming a paid plan after signup still use the API (Free sleeps after ~15 min idle).

---

## Integrations

Setup guides live under `docs/` — keep real credentials in env vars / host secrets only.

| Channel | Status | Guide |
|---------|--------|-------|
| HubSpot | Read-only OAuth + deal note import | [`docs/hubspot-setup.md`](docs/hubspot-setup.md) · `npm run test:hubspot` · `npm run test:hubspot:live` |
| Zoom RTMS | Live transcripts | [`docs/zoom-rtms-setup.md`](docs/zoom-rtms-setup.md) |
| Google Meet / Gmail | OAuth + mailbox search | [`docs/google-meet-setup.md`](docs/google-meet-setup.md) |
| Microsoft Teams / Outlook | OAuth + mailbox search | [`docs/teams-setup.md`](docs/teams-setup.md) |

Not claimed as bidirectional CRM sync. Meet/Teams share the same Live Meeting → triage → end-session autopsy pipe as Zoom.

---

## Demo fixtures

| File | Scenario |
|------|----------|
| `fixtures/sarah_mark_transcript.txt` | Authority gap (recoverable) |
| `fixtures/transcript_1_velocity_deal.txt` | Closed-won velocity |
| `fixtures/transcript_3_federal_audit.txt` | Structural lock |

---

## Working agreements

- Merge to `main` only when CI is green (`.github/workflows/test.yml`).
- Build on `feature/*` first.
- After each Cursor session, append a handoff to [`docs/session-log.md`](docs/session-log.md).

### Still open (ops)

- [ ] Point `www.getldr.ca` DNS at GitHub Pages and set Render `FRONTEND_ORIGIN=https://www.getldr.ca,https://getldr.ca,http://localhost:5173`
- [ ] Legal counsel review of Trust Pack
- [ ] Supabase PITR + EU region if GDPR required
- [ ] Supabase Auth + `user_id` on saves for RLS
