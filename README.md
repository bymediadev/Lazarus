# Lazarus

Deterministic deal autopsy engine for stalled B2B pipeline. Gemini extracts forces; `server/scoring.ts` computes viability, DRI, and trajectory.

## Quick start

```bash
cp .env.example .env   # add GEMINI_API_KEY (AIza or AQ. format)
npm install
npm run dev            # UI http://localhost:5173  API http://localhost:3001
```

Windows: always use `npm run dev` (includes `node --use-system-ca` for Gemini TLS).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Full stack (API + UI) |
| `npm run test` | Scoring + grounding regression + env check |
| `npm run purge:retention` | Null transcript_text older than DATA_RETENTION_DAYS |
| `npm run test:stress-deep-context` | Extended deep-context POST against local API |

## Architecture

```
Transcript → Gemini (extract) → grounding.ts → scoring.ts (DRI) → Supabase
```

- **Layer 1:** LLM extraction only (no scores in prompt output)
- **Layer 2:** Deterministic compiler (`server/scoring.ts`)
- **Layer 3:** Read-only UI projection

## Supabase

Apply migrations in order in SQL Editor:

1. `supabase/setup.sql` (or existing schema)
2. `003_enterprise_rls.sql`
3. `004_retention_purge.sql`
4. `005_lockdown_security_definer_rpc.sql`
5. `006_rescue_outcomes.sql`
6. `007_purge_audit_log.sql`
7. `008_ingest_metadata.sql` — `ingest_metadata` + `deal_memory_summary` on `call_post_mortems`

Server saves use `SUPABASE_SERVICE_ROLE_KEY` (never expose to frontend).

### Scheduled retention purge (GitHub Actions)

Workflow: `.github/workflows/purge-retention.yml` (daily 03:00 UTC).

Repository secrets:

| Secret | Value |
|--------|-------|
| `LAZARUS_API_URL` | Production API base URL (e.g. `https://your-app.onrender.com`) |
| `PURGE_CRON_SECRET` | Same value as `PURGE_CRON_SECRET` on the API server |

The workflow POSTs to `/api/admin/purge-retention` with header `x-cron-secret`.

## Trust Pack (v1.4)

Customer-facing legal and security docs. **Canonical URLs** (use in contracts, footers, and sales):

| ID | Label | URL |
|----|-------|-----|
| PP-001 | Privacy Policy | `/api/trust-pack/privacy` |
| ToS-001 | Terms of Service | `/api/trust-pack/terms` |
| DPA-001 | Data Processing Addendum | `/api/trust-pack/dpa` |
| SEC-001 | Security Overview | `/api/trust-pack/security-overview` |
| SEC-002 | Security Battlecard | `/api/trust-pack/battlecard` |

Source files live in `public/`. Legacy paths such as `/privacy.html` **301-redirect** to the canonical URL above.

**Before production:** replace placeholders (`[Legal entity name]`, `[privacy@yourdomain.com]`, `[yourdomain.com]`) in all five files.

## Deploy on Render

Single **Web Service** (monolith): `npm run build` → `dist/`, `npm start` → Express serves `/api/*` + static UI.

Optional split: Lovable UI + Render API — follow **`docs/lovable-api-wiring.md`** (`VITE_API_URL`, `VITE_LAZARUS_API_KEY`, Trust Pack absolute URLs).

| Setting | Value |
|---------|-------|
| Build | `npm install && npm run build` |
| Start | `npm start` |
| Health check | `/api/health` |
| Blueprint | `render.yaml` in repo root (optional one-click) |

**Env vars on Render** (copy from local `.env`): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PURGE_CRON_SECRET`, `DATA_RETENTION_DAYS`, `NODE_ENV=production`. After first deploy, set `FRONTEND_ORIGIN` to your `https://*.onrender.com` URL (comma-separate `http://localhost:5173` for local dev). Set `LAZARUS_API_KEY` and `VITE_LAZARUS_API_KEY` to the **same** random string (UI sends `X-Api-Key`; Vite bakes the client value in at build time). Do **not** set `VITE_API_URL` on Render — UI uses same-origin `/api`.

Free tier spins down after ~15 min idle; hit `/api/health` before demos.

## Merge policy

Merge to `main` only when CI is green (`.github/workflows/test.yml` runs `npm test` + `npm run build` on every push and PR). Build experiments on `feature/*` branches first. After each Cursor session, append a note to `docs/session-log.md`.

## Production checklist

- [x] Replace Trust Pack placeholders (entity name, contact emails, domain)
- [x] Set `LAZARUS_API_KEY` and pass `X-Api-Key` header from clients
- [ ] Set `FRONTEND_ORIGIN` to your real domain
- [x] Replace `PURGE_CRON_SECRET`, set GitHub secrets (`LAZARUS_API_URL`, `PURGE_CRON_SECRET`), and enable purge cron workflow
- [ ] Legal counsel review of Trust Pack v1.1
- [ ] Enable Supabase PITR + EU region if GDPR required
- [ ] Wire Supabase Auth + `user_id` on saves for RLS

## Integrations

### HubSpot (read-only OAuth + webhook ingest)

**OAuth (Deal Profile):** Connect with scopes `oauth`, `crm.objects.deals.read`, `crm.objects.notes.read`. Search deals and import associated notes into `account_id`, `sales_cycle_days`, and `historical_crm_context`. Env: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, optional `HUBSPOT_REDIRECT_URI`. Tokens: `.data/hubspot-tokens.json`. Test: `npm run test:hubspot`.

**Webhook ingest:** `POST /api/webhooks/hubspot` maps a HubSpot deal snapshot into the same deep-context fields. Optional `HUBSPOT_WEBHOOK_SECRET`. Test: `node --use-system-ca scripts/test-hubspot-webhook.mjs` (requires dev server).

Not a bidirectional CRM sync product claim.

### Zoom RTMS (live meeting transcripts)

OAuth + RTMS webhook ingest for **live Zoom transcripts** during the Meeting Companion session. See **`docs/zoom-rtms-setup.md`**.

### Google Meet / Workspace

OAuth Connect for Google Meet. Live caption auto-ingest is next; mic + paste feeds the shared live Recovery Brief today. See **`docs/google-meet-setup.md`**.

### Microsoft Teams (Entra ID / Graph)

OAuth Connect via Microsoft Entra ID. Graph online-meeting transcript pull is next; mic + paste feeds the shared live Recovery Brief today. See **`docs/teams-setup.md`**.

Meet and Teams share the same Live Meeting → live triage → end-session autopsy pipe as Zoom.

## Demo fixtures

- `fixtures/sarah_mark_transcript.txt` — authority gap (recoverable)
- `fixtures/transcript_1_velocity_deal.txt` — closed-won velocity
- `fixtures/transcript_3_federal_audit.txt` — structural lock
