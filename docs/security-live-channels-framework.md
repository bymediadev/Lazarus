# Security Framework Blueprint — Live Evidence Channels

> **INTERNAL ONLY** — talking points for demos / InfoSec. Customer-facing Trust Pack is in `public/`.

**Status:** Internal blueprint for demos / InfoSec conversations  
**Aligned to:** Lazarus Deal Recovery (shipped code as of 2026-07)  
**Audience:** Sales managers, VPs, and their InfoSec / legal reviewers  
**Companion docs:** SEC-001 Security Overview · SEC-002 Battlecard · PP-001 · ToS-001 · DPA-001

---

## 1. Positioning (say this first)

Lazarus Deal Recovery is a **judgment layer**, not a recorder and not a messenger.

- Managers use it to answer: *recoverable vs flat no, what’s blocking, what to do next.*
- Channels (email, live meeting, field capture) are **how evidence enters** the same analysis engine.
- Humans decide. We do not send outreach, join as a note-taker bot by default, or close deals.

**One-liner for security review:**  
“You authorize a read-only connection or upload. We analyze on our server, score with fixed rules, and do not train public models on your content.”

---

## 2. Live channel map (what actually ships)

| Channel | How data enters | Access model | Leaves customer systems as |
|---|---|---|---|
| **Email (Gmail / Outlook)** | User connects OAuth → searches a deal → pulls matching **threads** into the evidence package | Read-only scopes | Plain-text thread content for that analysis |
| **Live Zoom** | Zoom RTMS webhook → live diarized transcript → Meeting Companion / triage | Zoom app scopes + webhook secret | Transcript turns (not a long-term Zoom recording archive) |
| **Meet / Teams live** | Connected workspace / Graph paths where configured; mic + paste fallback | Read-oriented meeting / mail scopes | Transcript or pasted text |
| **Field / in-person** | Browser (offline-capable) voice memo → upload with analysis | User-initiated capture only | Audio buffer → transcript (audio not kept as product storage) |
| **HubSpot (optional)** | OAuth → import deal notes into deal history | Read-only deals + notes | Note text / deal metadata for context |
| **Upload (docs / recordings)** | Drag-drop PDF, Word, audio/video | Explicit file upload | Parsed text / transcription |

**Not claimed today:** silent always-on inbox scraping, autonomous CRM write-back, or “we listen to every meeting without you starting a session.”

---

## 3. Trust principles (non-negotiable)

1. **Least privilege** — Prefer `*.readonly` / `Mail.Read` / HubSpot deals+notes read. No send-mail or CRM write scopes in the live product path.
2. **User-initiated pull** — Mailbox search attaches threads the user asks for; not a background firehose into every deal.
3. **Server-side judgment** — Extraction may use Gemini; scoring / grounding run on the Lazarus API. Keys never ship to the browser.
4. **No public model training** — Configure providers for zero-retention / no training where available.
5. **Customer warranty on capture** — Customer is responsible for recording consent and authority to upload or connect mailboxes (ToS §2).
6. **Honest roadmap** — Not SOC 2 Type II yet. Disclose early; offer Trust Pack + architecture table.

---

## 4. Data flow (unified evidence → one brief)

```
[ Gmail / Outlook thread ]
[ Zoom / Meet / Teams live turns ]
[ Field audio / upload / paste / HubSpot notes ]
              │
              ▼
     Lazarus API (evidence package stitch)
              │
     ┌────────┴────────┐
     │  Gemini extract │  (ephemeral text)
     │  Grounding audit│  (strip invented claims)
     │  Deterministic  │  (DRI / viability / recovery)
     └────────┬────────┘
              ▼
     Recovery Brief + optional CRM paste
              │
              ▼
     Optional Supabase save (scores / analysis JSON;
     raw transcript_text purgeable — default 30 days)
```

**Security implication:** Multimodal input does **not** multiply storage surfaces if raw audio stays in-memory and mailbox content is treated like any other customer-supplied transcript for that run.

---

## 5. Channel-specific controls

### 5.1 Email (Gmail / Outlook)

| Control | Current practice |
|---|---|
| Scope | Gmail: `gmail.readonly` (+ Meet/calendar readonly where used). Outlook: `Mail.Read`, `User.Read` |
| Auth | OAuth 2.0 popup; state parameter; disconnect clears stored tokens |
| Pull model | Search → expand top matching **threads** → attach to evidence package |
| Minimization | Import is deal-scoped by user query, not full-mailbox dump into every analysis |
| Residual risk | Token file on API host (see §7); signature/footer noise is a product quality issue, not a separate data store |

**Talk track:** “Read-only. You pick the thread. We don’t send email from Lazarus Deal Recovery.”

### 5.2 Live Zoom (and meeting companions)

| Control | Current practice |
|---|---|
| Transport | HTTPS / TLS 1.3; Zoom Home URL served with OWASP-style security headers |
| Ingress | Signed webhook path (`ZOOM_WEBHOOK_SECRET_TOKEN`); RTMS start/stop events |
| Data shape | Live diarized transcript turns for triage — not a permanent Zoom cloud recording vault inside Lazarus |
| Fallback | Mic + paste when RTMS unavailable (e.g. local Windows) |
| Residual risk | Live content is highly sensitive; keep session explicit and short-lived in product UX |

**Talk track:** “We don’t replace Zoom. When you run a live session, transcript turns feed the same judgment engine — encrypted in transit, scored on our server.”

### 5.3 Field / in-person capture

| Control | Current practice |
|---|---|
| Initiation | Rep starts capture in-browser; offline-capable local staging |
| Processing | Audio uploaded for transcription; product design: process in memory, don’t keep raw audio as the system of record |
| Consent | Same customer warranty as any recording upload |
| Residual risk | Background noise → accuracy; security story stays “user-initiated, short clip, analyze once” |

**Talk track:** “Field capture is a high-fidelity note the rep chooses to take — not always-on phone surveillance.”

### 5.4 HubSpot notes (optional)

| Control | Current practice |
|---|---|
| Scope | `crm.objects.deals.read`, `crm.objects.notes.read` only |
| Use | Historical context for the evidence package / deal profile |
| Residual risk | Same OAuth token storage model as other connectors |

---

## 6. Baseline platform controls (reuse in every review)

| Control | Implementation |
|---|---|
| Encryption in transit | TLS 1.3 |
| Encryption at rest | AES-256 via Supabase / cloud host when data is stored |
| Tenant isolation | PostgreSQL RLS on stored deal rows when auth/`user_id` enabled |
| Browser exposure | No service-role or model API keys in the client |
| Anti-hallucination | Server grounding before scores |
| Retention | Configurable purge of raw `transcript_text` (default 30 days); derived scores/reports retained for deal life |
| Prod hardening | Optional API key, CORS allowlist, purge cron secret |

---

## 7. Known gaps (disclose — then roadmap)

Be explicit in enterprise calls. Do not oversell.

| Gap | Why it matters | Near-term hardening |
|---|---|---|
| **Not SOC 2 Type II** | Procurement checkbox | Continue Trust Pack honesty; schedule audit when ARR justifies |
| **OAuth tokens on API disk** (`.data/*-tokens.json`) | Host compromise could expose mailbox/CRM tokens | Move to encrypted secret store / Supabase vault; encrypt at rest; rotate on disconnect |
| **Pilot auth may be light** | Multi-user enterprise needs SSO | Supabase Auth end-to-end + SAML/OIDC |
| **SEC-001 / SEC-002 lag shipped channels** | Battlecard still understates Gmail/Outlook/HubSpot | Update Trust Pack tables to match this blueprint |
| **No formal pen-test report** | Security questionnaires | Budget third-party test before regulated verticals |
| **Customer consent remains on them** | Legal surface for live/field audio | Keep ToS §2 prominent; add channel-specific consent checklist in UI copy |

---

## 8. Objection cheat sheet

| Question | Answer |
|---|---|
| “Do you read our whole inbox?” | No. Read-only OAuth; user searches and attaches specific deal threads. |
| “Do you store Zoom recordings?” | We consume live transcript turns for triage/analysis. We are not your Zoom recording archive. |
| “Is field capture always listening?” | No. Rep starts capture; short clip → analyze. |
| “Where do keys live?” | Server env only — never in the browser. |
| “Do you train on our deals?” | No public model training on customer content; providers configured for zero-retention where available. |
| “SOC 2?” | Not yet. Here’s SEC-001 + DPA + sub-processors; hosting provider maintains its own certs. |
| “Can you write to Salesforce/HubSpot?” | Not as autonomous sync. Optional HubSpot **read** for notes; CRM paste is human-controlled. |

---

## 9. Recommended Trust Pack updates (implementation backlog)

1. **SEC-001 §1–2** — Add shipped channels: Gmail/Outlook thread search, Zoom RTMS, field capture, HubSpot read notes. Move “CRM sync” from blanket roadmap to “write-back / bi-directional sync still roadmap.”
2. **SEC-002 “Where does information come from?”** — Replace “we do not pull email automatically” with “user-initiated mailbox search (read-only).”
3. **PP-001 / DPA** — List Google (Gmail/Meet), Microsoft Graph, Zoom, HubSpot as channel sub-processors when connected.
4. **Optional public page** — Thin “Live Channels Security” one-pager linked from footer (this blueprint → customer-facing HTML).

---

## 10. What not to build next (security-wise)

- Outbound Slack / WhatsApp / SMS send from the product (parked; expands compliance surface).
- Always-on mailbox webhooks without per-deal user intent.
- Broad CRM write scopes “for convenience.”

Stay evidence-in → judgment-out until the forecast loop is proven with managers.

---

## Document control

| Field | Value |
|---|---|
| ID (proposed) | SEC-003 |
| Owner | Product / engineering |
| Review | Legal before regulated RFPs |
| Related | `docs/backlog-messaging-channels.md` (parked Slack/WA/SMS) |
