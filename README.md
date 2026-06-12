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
| `npm run cleanup:ports` | Kill stale Node processes on 3001 / 5173-5176 (Windows) |

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

Server saves use `SUPABASE_SERVICE_ROLE_KEY` (never expose to frontend).

## Production checklist

- [ ] Set `LAZARUS_API_KEY` and pass `X-Api-Key` header from clients
- [ ] Set `FRONTEND_ORIGIN` to your real domain
- [ ] Replace `PURGE_CRON_SECRET` and schedule purge cron
- [ ] Legal review: `public/privacy.html`, `terms.html`, `dpa.html`
- [ ] Enable Supabase PITR + EU region if GDPR required
- [ ] Wire Supabase Auth + `user_id` on saves for RLS

## Demo fixtures

- `fixtures/sarah_mark_transcript.txt` — authority gap (recoverable)
- `fixtures/transcript_1_velocity_deal.txt` — closed-won velocity
- `fixtures/transcript_3_federal_audit.txt` — structural lock
