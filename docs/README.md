# Docs index

Operator and product docs for Lazarus Deal Recovery. Root overview: [`../README.md`](../README.md)

Deploy path: **GitHub Pages** serves the public site at `www.getldr.ca`; **Render** serves `/api` at `https://lazarus-4uxi.onrender.com`. Locally, one Node process still serves both. See [hosting.md](./hosting.md). PHP-only shared hosting (typical Bluehost cPanel) will not run the API.

Do not commit secrets — use `.env.example` and host/GitHub secret stores.

---

## Setup & integrations

| Doc | Use when |
|-----|----------|
| [zoom-rtms-setup.md](./zoom-rtms-setup.md) | Zoom RTMS live transcripts |
| [google-meet-setup.md](./google-meet-setup.md) | Google OAuth, Gmail search, Meet live captions extension |
| [teams-setup.md](./teams-setup.md) | Microsoft Entra / Teams / Outlook |
| [hubspot-setup.md](./hubspot-setup.md) | HubSpot public OAuth app + Lazarus Connect (see also `hubspot-app/`) |
| [auth-setup.md](./auth-setup.md) | Login: email magic link, Google, HubSpot/Salesforce bridge + Render Vite env |
| [billing-setup.md](./billing-setup.md) | Stripe paywall after 5 free analyses ($10 / $99 / $499) |
| [hosting.md](./hosting.md) | GitHub Pages (site) + Render (API); DNS cutover |
| [turnstile-setup.md](./turnstile-setup.md) | Cloudflare Turnstile captcha before each analysis |

---

## Security & trust drafts

| Doc | Use when |
|-----|----------|
| [security-live-channels-framework.md](./security-live-channels-framework.md) | InfoSec / demo talking points for live evidence channels |

Customer-facing Trust Pack HTML lives in `public/` and is served at `/privacy`, `/terms`, `/dpa`, and `/security-overview` (see root README).

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
