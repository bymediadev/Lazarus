# Lovable ↔ Local UI parity prompt

**Source of truth:** local Cursor Lazarus (Deal Judgment Layer + Liam upgrades).  
**Lovable project:** `lazarusdealrescue` → https://lovable.dev/projects/755d6740-c643-4b89-9add-52b90da08682  
**Published:** https://lazarusdealrescue.lovable.app  
**Preview:** https://id-preview--755d6740-c643-4b89-9add-52b90da08682.lovable.app  

**Updated:** 2026-07-17 — Path A/B pilot UI **plus** Recovery Brief judgment layer (what happened / next / who), buying-group alignment, pre-contract multi-meeting pathway, CRM deal stage on deal profile, Battlecard v1.8 Liam objections (served from Render Trust Pack).

Paste the **Prompt** block into Lovable chat (or send via agent). Confirm env first:

| Variable | Required value |
|---|---|
| `VITE_API_URL` | `https://lazarus-4uxi.onrender.com` (no trailing slash) |
| `VITE_LAZARUS_API_KEY` | Same as Render `LAZARUS_API_KEY` **if** Render has a key set. If Render has no `LAZARUS_API_KEY`, leave empty / omit (API allows unauthenticated). |

Trust Pack + analysis must hit Render (`${VITE_API_URL}/api/...`), never Lovable-origin `/api/...`.

**Known gap (fix first):** published/preview currently shows **API NOT CONFIGURED** when `VITE_API_URL` is missing. Set the env var in Lovable project settings, then rebuild/publish.

---

## Prompt

```
SYNC TASK: Make this Lovable app UI match the local Lazarus (Cursor) product exactly — including the July 17 Liam judgment-layer upgrades. Same screens, labels, pilot flow, Recovery Brief cards, and copy. Keep talking to the Render Express API — do NOT move scoring / Gemini / Zoom RTMS / buying-group math / contract pathway into Lovable. Lovable is display + FormData client only.

=== ENV (do this first — confirm, don’t invent) ===
- VITE_API_URL = https://lazarus-4uxi.onrender.com (no trailing slash) — REQUIRED
- VITE_LAZARUS_API_KEY = same as Render LAZARUS_API_KEY when Render locks the API; otherwise omit
- All API + Trust Pack calls use `${VITE_API_URL}` + header X-Api-Key when key is set
- If VITE_API_URL is empty, analysis will fail — do not ship that state
- REMOVE any red “API NOT CONFIGURED” / “API offline / npm run dev” badge from the happy path. Soft copy only if fetch fails: “Temporarily unavailable — try again in a moment”

REMOVE old product surface if still present:
- “DEAL RESCUE CONSOLE”
- Hero: “Secure deal autopsies for stalled pipeline…”
- Primary tabs Calculator | Audio | Transcript
- Any “API online / API OFFLINE / Server on / Engine online (host)” as a pilot step or happy-path header badge

=== TARGET LAYOUT (top → bottom) ===
Dark navy + teal/emerald accents, monospace labels. Match local Judgment Layer aesthetic.

1) HEADER
- Logo + “Lazarus” + tag “Deal Judgment Layer”
- Status shows analysis state only (STANDBY / Running… / etc.)
- Soft unavailable copy only when backend unreachable
- Do NOT show “API: host”, “API online”, or “run npm run dev”

2) HERO (HeroTrustBanner) — exact sense
- Eyebrow: Deal judgment layer · v1
- Headline: “Lazarus shows you what the buyer is doing inside a stalled deal right now, so you know which opportunities are actually recoverable.”
- Body: “CRMs tell you what happened; Lazarus tells you what to do next. Paste a transcript or speak on a live call — get a Recovery Brief you can defend in a forecast meeting. A person still runs the deal.”
- Bullets: Problem (CRM stalls without why) / Solution (paste or speak → Recovery Brief) / Guardrail (Trust Pack, encryption, purge, no public model training)
- Trust Pack links → `${VITE_API_URL}/api/trust-pack/{slug}` (privacy, terms, dpa, security-overview, battlecard)

3) CAPTURE STACK
- Three layers: Capture → Lazarus → You
- Chips: Zoom, Meet, Teams (open Live Meeting + set platform), Gong, Chorus, Otter, File upload
- Note: “Fastest test: follow the self-serve guide below (Path A → Path B)…”
- Link: Jump to step-by-step guide ↓ → #demo-test-guide

4) WORKSPACE (#workspace) — two columns

LEFT — Deal Intake
- Collapsed Deal profile (optional):
  - Account ID
  - Sales cycle length (days)
  - CRM deal stage (optional) — placeholder e.g. appointmentscheduled, presentationscheduled, contractsent
  - Historical CRM context JSON textarea
  - “Load demo history” button — fills multi-meeting Acme fixture (Discovery / Technical Eval / Procurement objections)
  - Hint: account + stage + prior-meeting objections stitch a pre-contract pathway so every logged concern is met before a unified contract goes out
- Tabs (labels exact):
  A. Call Auto-Autopsy (default)
     - Recording dropzone
     - Call Transcript textarea
     - “Load sample” next to Call Transcript — Sarah Chen / Mark O’Brien stalled excerpt (authority gap: Dave VP Infrastructure)
     - Deal value field
  B. Live Meeting
     - Platform: Zoom (default) | Google Meet | Microsoft Teams
     - Steps: Start live session → speak/paste → End & run analysis
     - Start works WITHOUT Connect Zoom/Meet/Teams
     - Connect ONLY under collapsed Optional
     - Soft warn if unavailable (no “API offline — npm run dev”)
  C. Email Thread
  D. Field Capture
- Run Deal Analysis:
  - Disabled until transcript/recording/email exists
  - Empty label: “Add a transcript or recording first”
  - Hint: “Fastest path: click Load sample above the transcript box, then this button turns green and runnable.”
  - When ready: “Run Deal Analysis”
  - POST `${VITE_API_URL}/api/post-mortem` as FormData with X-Api-Key when set
  - FormData fields when present:
      recording, transcript, email_thread, deal_value,
      account_id, sales_cycle_days, deal_stage,
      historical_crm_context (JSON string),
      live_transcript_payload, live_session_objections, field_capture
  - Response is the report object directly (NOT wrapped in { report })

RIGHT — Deal Score & Recovery Brief
Render API cards in this order when fields exist (Lovable displays; Express computes):

A) What happened · What next · Who to contact  (action_brief)
   - CRM stage + noise-cap note
   - Three columns: what_happened / what_next / who_to_contact (name + role_label + why)
   - Supporting actions (max 2)

B) Pre-contract pathway (multi-meeting)  (contract_readiness)
   - Gate badge: TRACKING | GATED | READY | INSUFFICIENT_HISTORY
   - Headline + why_it_matters
   - If block_contract_send: banner “Do not send the contract yet — clear every open concern so one unified paper goes out.”
   - Stats: meetings tracked / open / addressed
   - Meeting list + concern list (OPEN / BLOCKING / ADDRESSED) with source meeting + owner_hint
   - next_unified_step + checklist

C) Buying-group alignment (inferred)  (buying_group_alignment)
   - Status badge ALIGNED | PARTIAL | MISSING + summary
   - Role rows: present / quiet / missing (inferred) + evidence
   - Quiet stakeholders line

D) Existing triage / history / friction / stall / resuscitation / CRM copy (keep if already present)
   - Copy Action Items should prefer action_brief text when present
   - Copy Compressed CRM Notes should include stage, buying group, pathway gate, open concerns, what happened / next / who

Empty / loading / soft error states unchanged in spirit.

5) DEMO TEST GUIDE (#demo-test-guide) — REQUIRED
Above Enterprise Trust. Side-by-side with Security Battlecard card.
Heading: “Paste or speak. Get the Recovery Brief.”
Path A — Past call (today) — 3 steps — always unlocked
  1 Paste (or load sample)  2 Run Deal Analysis  3 Read the Recovery Brief → unlocks Path B
Path B — Live call (this week) — 4 steps — locked until Path A
  1 Open Live Meeting  2 Start live session  3 Capture buyer dialogue  4 End & get the brief
localStorage unlock persistence (no login).
Battlecard side card → `${VITE_API_URL}/api/trust-pack/battlecard` (+ security-overview)
Do NOT gate on Server/API/Chrome steps.

Optional Path A stretch (document in guide footnote, don’t add steps):
- Load demo history + set CRM stage `contractsent` before Run → expect GATED pre-contract pathway and Dave as who-to-contact on Sarah/Mark sample.

6) ENTERPRISE TRUST
Three pillars + Trust Pack links via Render URLs.

=== KEEP ===
- VITE_API_URL + optional VITE_LAZARUS_API_KEY
- No second Gemini / scoring / pathway engine in Lovable
- No Zoom Marketplace listing work
- Dark theme
- No auth wall for Path A/B pilot

=== SMOKE (must pass) ===
1. Hero uses stalled-deal + CRM contrast copy (not Rescue Console)
2. No “API NOT CONFIGURED” / API host badge on happy path when VITE_API_URL is set
3. Four intake tabs + Deal profile with CRM deal stage + Load demo history
4. DemoTestGuide Path A=3 / Path B=4; Path B locked until Path A
5. Load sample → Run hits Render → Recovery Brief shows what happened / next / who when API returns action_brief
6. Load demo history + deal_stage=contractsent + sample → contract_readiness.gate_status GATED banner visible
7. Buying-group card appears when buying_group_alignment present
8. Battlecard opens Render trust-pack URL (Liam objections live on Render HTML — no need to re-author battlecard in Lovable)
9. Live Meeting Start works without Connect Zoom
10. Refresh after Path A → Path B still unlocked
```

---

## Quick compare

| Surface | Local (Cursor) | Lovable must match |
|---|---|---|
| Product name | Deal Judgment Layer | Same |
| Hero | Stalled-deal + CRM contrast | Same |
| API badge | Soft unavailable only | Same — never “API NOT CONFIGURED” when env set |
| Deal profile | Account / cycle / **deal stage** / demo history | Same |
| Path A / B | 3 + 4 steps | Same |
| Recovery Brief | action_brief + buying_group + **contract_readiness** | Same (display API fields) |
| Battlecard | Render Trust Pack v1.8 (Liam) | Link only — content on Render |
| Brain | Render Express | Same (`VITE_API_URL`) |

Local remains source of truth until Lovable matches this prompt.
