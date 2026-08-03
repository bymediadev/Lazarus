# Backlog: Slack / WhatsApp / SMS evidence channels

> **Backlog draft** — parked; not a shipped product claim.

**Status:** Parked — do not build now  
**Parked:** 2026-07-29  
**Revisit:** ~2027-01-29 (six months)  
**Product intent:** Same pattern as Mailbox Search — look through chats, pull deal threads into the evidence package, run analysis. Prefer **read/import** first; outbound send from Lazarus Deal Recovery is optional and later.

---

## Why later

Prove email + docs + HubSpot + report clarity first. Messaging channels add identity mapping, compliance (WhatsApp templates, A2P 10DLC), and ops cost before the core loop is locked.

**Suggested build order when revisiting:** Slack → SMS (Twilio) → WhatsApp Business Cloud API.

---

## Core data schema

Unify Slack, WhatsApp, and SMS by mapping platform identities to a single Contact, and streaming messages into a unified Timeline.

```
[ Contacts Table ]
       │
       ├─── 1 : Many ───> [ Identities Table ] (Slack ID, Phone Number, etc.)
       │
       └─── 1 : Many ───> [ Messages Table ] (Unified Communication Log)
```

### 1. Contacts

Master record for the person the sales team is talking to.

| Column | Type |
|--------|------|
| id | UUID, PK |
| first_name | VARCHAR |
| last_name | VARCHAR |
| company_name | VARCHAR |
| created_at | TIMESTAMP |

### 2. Identities

Maps a contact to platform handles. One contact, many identities.

| Column | Type |
|--------|------|
| id | UUID, PK |
| contact_id | UUID, FK → Contacts |
| platform | ENUM: `slack`, `whatsapp`, `sms` |
| platform_user_id | VARCHAR — e.g. `+15551234567`, Slack `U123456` |
| metadata | JSONB — channel IDs, workspace IDs, WhatsApp profile data |

### 3. Messages (unified timeline)

| Column | Type |
|--------|------|
| id | UUID, PK |
| contact_id | UUID, FK → Contacts |
| direction | ENUM: `inbound`, `outbound` |
| platform | ENUM: `slack`, `whatsapp`, `sms` |
| raw_payload | JSONB — original API payload |
| clean_text | TEXT — plain text for Lazarus Deal Recovery UI / analysis |
| timestamp | TIMESTAMP |

---

## Inbound data flow (webhooks)

```
[ Slack / WhatsApp / SMS API ] ──(Webhook)──> [ Lazarus Deal Recovery Gateway ]
  ──> [ Match Identity ] ──> [ Save to Timeline ]
```

1. **Inbound hit** — Customer texts WhatsApp / SMS or replies in Slack Connect.
2. **Gateway** — Public routes: `/api/webhooks/slack`, `/api/webhooks/whatsapp`, `/api/webhooks/sms`.
3. **Identity match** — Extract `platform_user_id`; look up Identities:
   - Match → attach to existing `contact_id`
   - No match → create Unknown Contact + identity; prompt rep to name/merge
4. **Timeline push** — Write Messages row; update UI (WebSockets optional).

**UI model (preferred):** Mailbox-style search — “find deal chat → attach to evidence package → analyze,” not a full messenger.

---

## Outbound data flow (optional / later)

Only if product still wants send-from-Lazarus-Deal-Recovery after import is proven:

1. Rep selects contact + channel, types message, sends.
2. Route:
   - **SMS** → Twilio `POST /Messages`
   - **WhatsApp** → Meta Graph API; use approved templates if outside 24h window
   - **Slack** → `chat.postMessage` with stored channel ID
3. Optimistic insert into Messages as `outbound`.

**Caution:** Outbound risks positioning Lazarus Deal Recovery as messaging automation. Stay evidence/judgment-first unless ICP clearly asks for send.

---

## Next steps when unparking (~2027-01)

1. Confirm Slack-first MVP as Mailbox-tab twin (search + import thread text).
2. Map Slack Events API / Twilio / Meta webhook JSON payloads.
3. Draft Express routes under `server/integrations/` mirroring Gmail/Outlook.
4. Decide whether Contacts/Identities live in Supabase or stay ephemeral per evidence package for v1.
