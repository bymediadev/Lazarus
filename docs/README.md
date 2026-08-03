# Docs index

**Private repo — team only.** These files are for building, deploying, and selling Lazarus Deal Recovery. Do not forward, publish, or paste into public channels.

Root product overview and quick start: [`../README.md`](../README.md)

---

## Setup & integrations

| Doc | Use when |
|-----|----------|
| [zoom-rtms-setup.md](./zoom-rtms-setup.md) | Zoom RTMS live transcripts |
| [google-meet-setup.md](./google-meet-setup.md) | Google OAuth, Meet, Gmail thread search |
| [teams-setup.md](./teams-setup.md) | Microsoft Entra / Teams / Outlook |
| [lovable-api-wiring.md](./lovable-api-wiring.md) | Split deploy: Lovable UI → Render API |

Env vars and secret names: repo root `.env.example` (never commit real values).

---

## Security & trust (internal drafts)

| Doc | Use when |
|-----|----------|
| [security-live-channels-framework.md](./security-live-channels-framework.md) | InfoSec / demo talking points for live evidence channels |

Customer-facing Trust Pack HTML lives in `public/` and is served at `/api/trust-pack/*` (see root README).

---

## Product / GTM (internal only)

| Doc | Use when |
|-----|----------|
| [pitch-deck-james.md](./pitch-deck-james.md) | Internal pitch narrative |
| [backlog-messaging-channels.md](./backlog-messaging-channels.md) | Parked Slack / WhatsApp / SMS backlog — do not build yet |

ICP and outreach rules for agents: `.cursor/skills/icp/SKILL.md` (local Cursor skill; not a public playbook).

---

## Engineering notes

| Doc | Use when |
|-----|----------|
| [session-log.md](./session-log.md) | Cursor session handoffs — append newest at top |
| [monika-historical-memory-test.md](./monika-historical-memory-test.md) | Historical memory / retention operational test plan |

---

## What does not belong here

- API keys, OAuth client secrets, service-role keys → Render / local `.env` / GitHub Actions secrets only
- Customer data or live transcripts → never commit
- Public marketing copy that overclaims product scope → keep claims aligned with shipped code
