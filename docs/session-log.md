# Cursor Session Log

> **Engineering notes** — Cursor session handoffs; not product documentation.

Two-sentence handoff notes for each build session. Append newest entries at the top.

---

## 2026-09-10 — Salesforce PKCE (missing code challenge)

**Built:** Salesforce authorize now sends S256 `code_challenge`; token exchange sends `code_verifier`. Top-level `/oauth-start` hop sets an httpOnly cookie so the verifier is not lost on the Pages → API cross-site POST.

**Files:** `server/integrations/salesforce/pkce.ts`, `oauth.ts`, `routes.ts`, `server/integrations/connectFlow.ts`, `scripts/test-security-gates.mjs`, `docs/salesforce-setup.md`

**Verified:** `npm run test:security` PKCE roundtrip + authorize URL params. Live login needs a Render deploy.

**Mess / later:** Idle TTL heartbeat, static egress IPs, dual-write Salesforce tokens to Supabase.

---

## 2026-09-09 — Salesforce AgentExchange app listing path

**Built:** Operator guide for Salesforce ECA OAuth + AgentExchange **app** listing (not Agentforce). Documented partner OAuth gaps (PKCE, refresh-token rotation, idle TTL, static egress, token persist).

**Files:** `docs/salesforce-setup.md`, `marketplace/salesforce/listing.md`, `docs/marketplace-listings.md`, `docs/README.md`, `marketplace/screenshots.md`

**Verified:** Docs only — no OAuth code change. Production `/api/health` already `salesforce: true`.

**Mess / later:** Implement PKCE + RTR persist + Supabase token dual-write before flipping ECA security toggles; paid Render static outbound IPs for refresh-token allowlist.

---

## 2026-08-28 — GitHub Pages frontend + Render API

**Built:** Split production: static Vite site on GitHub Pages (`www.getldr.ca`) calling the existing Render API; CORS and OAuth/Stripe return URLs prefer the custom domain. Render still serves the old monolith until DNS is switched.

**Files:** `server/integrations/oauthShared.ts`, `server/index.ts`, `server/billing.ts`, `server/integrations/zoom/routes.ts`, `.github/workflows/test.yml`, `scripts/prepare-github-pages.mjs`, `public/CNAME`, `docs/hosting.md`, `README.md`

**Verified:** `npm test` + `npm run build:pages` (local)

**Mess / later:** Point DNS at GitHub Pages after the first green Pages deploy; add GitHub secrets `VITE_LAZARUS_API_KEY` / `VITE_SUPABASE_*`; set Render `FRONTEND_ORIGIN=https://www.getldr.ca,...`.

---

## 2026-07-14 — Google Meet + Microsoft Teams OAuth scaffolds

**Built:** Connect Google Meet and Connect Teams (Entra/Graph) with status/callback/disconnect; shared live Recovery Brief pipe (mic/paste until auto-ingest).

**Files:** `server/integrations/google/*`, `server/integrations/teams/*`, `oauthShared.ts`, MeetingCompanion UI, `docs/google-meet-setup.md`, `docs/teams-setup.md`

**Verified:** `npm test` + `npm run build` pass

**Mess / later:** Meet caption stream + Teams Graph transcript pull; Wednesday Gong/Otter import.

---

## 2026-07-13 — Live triage Recovery Brief (Zoom / Meet / Teams pipe)

**Built:** In-call Recovery Brief panel that refreshes mid-session from rolling transcript; shared across Zoom, Meet, and Teams (RTMS or mic/paste).

**Files:** `server/liveTriage.ts`, `src/components/LiveTriageBrief.tsx`, `src/lib/liveTriage.ts`, `App.tsx`, `MeetingCompanion.tsx`

**Verified:** `npm test` + `npm run build`

**Mess / later:** Meet Workspace + Teams Graph OAuth still scaffold-only; Zoom RTMS remains Linux/Render for auto stream.

---

## 2026-07-13 — Zoom RTMS live meeting integration (Phase 1)

**Built:** Zoom OAuth connect, RTMS webhook handler, SSE live transcript stream into Meeting Companion, Connect Zoom UI.

**Files:** `server/integrations/zoom/*`, `src/lib/zoomIntegration.ts`, `MeetingCompanion.tsx`, `docs/zoom-rtms-setup.md`

**Verified:** `npm test` + `npm run build` pass.

**Mess / later:** Meet + Teams after Zoom pilot; RTMS SDK only runs on Linux (Render) — Windows uses mic/paste fallback.

---

## 2026-07-13 — Production hardening (self-serve checklist)

**Built:** API key auth wired in frontend (`X-Api-Key` header), GitHub Actions test workflow, session log, npm audit fix, merge policy in README.

**Files:** `src/lib/api.ts`, `src/lib/liveObjections.ts`, `.env.example`, `render.yaml`, `.github/workflows/test.yml`, `scripts/check-env.mjs`, `docs/session-log.md`, `README.md`

**Verified:** `npm test` and `npm run build` pass locally.

**Mess / later:** Supabase Auth + tenant RLS still unwired; large files (`gemini.ts`, `scoring.ts`) unchanged.

---

## Template (copy for next session)

```markdown
## YYYY-MM-DD — [Feature name]

**Built:** [What you added or changed in plain English.]

**Files:** [Comma-separated list of touched files.]

**Verified:** [How you tested — e.g. npm test, manual demo with sarah_mark fixture.]

**Mess / later:** [Anything messy a developer should clean up, or "none."]
```
