# Lazarus Deal Recovery

**Private repository — internal use only.** Do not share clones, secrets, prompts, or docs outside the team.

Judgment layer for sales managers and VPs: which stalled deals will close, which are recoverable vs a flat no, and what to do next. Gemini extracts evidence; `server/scoring.ts` computes viability, DRI, and trajectory. Humans decide.

Full doc map: **[`docs/README.md`](docs/README.md)**

---

## Quick start

```bash
cp .env.example .env   # add GEMINI_API_KEY (AIza… or AQ.… format)
npm install
npm run dev            # UI http://localhost:5173 · API http://localhost:3001
```

On Windows, always use `npm run dev` (includes `node --use-system-ca` for Gemini TLS).

Env reference: `.env.example` (never commit `.env` or `.data/`).

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
| PP-001 | Privacy Policy | `/api/trust-pack/privacy` |
| ToS-001 | Terms of Service | `/api/trust-pack/terms` |
| DPA-001 | Data Processing Addendum | `/api/trust-pack/dpa` |
| SEC-001 | Security Overview | `/api/trust-pack/security-overview` |
| SEC-002 | Security Battlecard | `/api/trust-pack/battlecard` |

Legacy HTML paths (e.g. `/privacy.html`) 301 to the canonical URLs above.

---

## Deploy (Render)

One **Web Service** monolith: `npm run build` → `dist/`, `npm start` → Express serves `/api/*` + static UI.

| Setting | Value |
|---------|-------|
| Build | `npm install && npm run build` |
| Start | `npm start` |
| Health | `/api/health` |
| Blueprint | `render.yaml` (optional) |

Required env (copy from local `.env`): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PURGE_CRON_SECRET`, `DATA_RETENTION_DAYS`, `NODE_ENV=production`, `FRONTEND_ORIGIN`, `LAZARUS_API_KEY`, `VITE_LAZARUS_API_KEY` (same random string as `LAZARUS_API_KEY`). Do **not** set `VITE_API_URL` on the monolith — UI uses same-origin `/api`.

Split UI (Lovable) + API: see [`docs/lovable-api-wiring.md`](docs/lovable-api-wiring.md).

Free tier sleeps after ~15 min idle — hit `/api/health` before demos.

---

## Integrations

Setup guides live under `docs/` — do not paste credentials into tickets or chats.

| Channel | Status | Guide |
|---------|--------|-------|
| HubSpot | Read-only OAuth + webhook ingest | `.env.example` · `npm run test:hubspot` |
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

- [ ] Set `FRONTEND_ORIGIN` to the real production domain (keep localhost for local)
- [ ] Legal counsel review of Trust Pack
- [ ] Supabase PITR + EU region if GDPR required
- [ ] Supabase Auth + `user_id` on saves for RLS
