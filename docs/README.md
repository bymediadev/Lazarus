# Docs index

Operator and product docs for Lazarus Deal Recovery. Root overview: [`../README.md`](../README.md)

Deploy path: **one Node process** serves the public site, `/app` tool, and `/api`. Render is the managed default; any Node VPS works. See [hosting.md](./hosting.md). PHP-only shared hosting (typical Bluehost cPanel) will not run this app.

Do not commit secrets — use `.env.example` and host/GitHub secret stores.

---

## Setup & integrations

| Doc | Use when |
|-----|----------|
| [zoom-rtms-setup.md](./zoom-rtms-setup.md) | Zoom RTMS live transcripts |
| [google-meet-setup.md](./google-meet-setup.md) | Google OAuth, Meet, Gmail thread search |
| [teams-setup.md](./teams-setup.md) | Microsoft Entra / Teams / Outlook |
| [hubspot-setup.md](./hubspot-setup.md) | HubSpot public OAuth app + Lazarus Connect (see also `hubspot-app/`) |
| [auth-setup.md](./auth-setup.md) | Login: email magic link, Google, HubSpot/Salesforce bridge + Render Vite env |
| [billing-setup.md](./billing-setup.md) | Stripe paywall after 5 free analyses ($10 / $99 / $499) |
| [hosting.md](./hosting.md) | Upload the whole site+API to Render or a Node VPS |

---

## Security & trust drafts

| Doc | Use when |
|-----|----------|
| [security-live-channels-framework.md](./security-live-channels-framework.md) | InfoSec / demo talking points for live evidence channels |

Customer-facing Trust Pack HTML lives in `public/` and is served at `/api/trust-pack/*` (see root README).

---

## Product / GTM drafts

| Doc | Use when |
|-----|----------|
| [pitch-deck-james.md](./pitch-deck-james.md) | Pitch narrative (draft — not a product claim) |
| [backlog-messaging-channels.md](./backlog-messaging-channels.md) | Parked Slack / WhatsApp / SMS backlog — do not build yet |

ICP and outreach rules for agents: `.cursor/skills/icp/SKILL.md` (local Cursor skill).

---

## Engineering notes

| Doc | Use when |
|-----|----------|
| [session-log.md](./session-log.md) | Cursor session handoffs — append newest at top |
| [monika-historical-memory-test.md](./monika-historical-memory-test.md) | Historical memory / retention operational test plan |

---

## What does not belong in git

- API keys, OAuth client secrets, service-role keys → Render / local `.env` / GitHub Actions secrets only
- Customer data or live transcripts
- Marketing copy that overclaims shipped product scope
