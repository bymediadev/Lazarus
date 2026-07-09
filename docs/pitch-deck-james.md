# Lazarus Pitch Deck — James (v2 · Lucy Sync Pivot)

**Positioning shift:** Deal Autopsy Tool → **Live Buyer Execution Engine**  
**Date:** July 2026 · Internal use

---

## Slide 1 — Title

**Lazarus**  
*Live Buyer Execution Engine for mid-market revenue teams*

Human-led. AI-assisted. Not an autonomous closer.

---

## Slide 2 — The Problem (reactive → too late)

Sales leaders can see **which** deals are stalled in CRM.  
They cannot reliably answer:

1. **What is the buyer actually trying to do right now?**
2. **What constraint is blocking action — in this meeting?**
3. **What changed since the last touchpoint — and what do we do next?**

By the time teams run a post-mortem, momentum is already gone.  
**Happy ears** fill the pipeline. Forecast slips. Recoverable revenue gets written off.

> Buyer pain language: *"I know which deals are stalled — I don't know why."*

---

## Slide 3 — Old vs New Core

| Old core (v1 wedge) | New core (v2 positioning) |
|---------------------|---------------------------|
| Deal Autopsy Tool | **Live Buyer Execution Engine** |
| Post-mortem after stall | **In-meeting intent + constraint tracking** |
| Reactive forensics | **Proactive execution intelligence** |
| "What went wrong?" | **"What's blocking action right now — and what do we do before we leave?"** |

**We keep autopsy as a capability** — not the headline.  
Autopsy is the recovery mode. Execution is the daily operating system.

---

## Slide 4 — What Lazarus Does (one-liner)

Lazarus models each deal as a **probabilistic constraint system** — buyer intent, operational blockers, structural limits, and timing — then tells reps and managers **what to do next** while the deal is still live.

Not Gong (recording). Not ChatGPT (summaries). Not an AI SDR (outreach).

---

## Slide 5 — Live Execution (in-meeting)

**Capture intent where it happens:**

- Call recordings + transcripts
- Field / in-person capture (mobile recorder, offline-safe)
- Stalled email thread history
- **Cross-channel stitch** → single chronological buyer narrative

**Output in ~60 seconds:**

- Weighted causal forces (Intent / Constraint / Structural / Timing)
- People Map + invisible veto-holders
- Deal Risk Index (DRI) — deterministic, not LLM prose
- Rescue triage: immediate 0–30 day actions
- CRM-ready notes (HubSpot / Salesforce paste)

**Use case:** Rep walks out of a discovery call knowing the real blocker — not the rep's optimistic read.

---

## Slide 6 — Historical Deal Memory *(new · MM/Enterprise unlock)*

### The constraint we heard in market

Default **30-day raw transcript purge** is right for privacy — but **wrong for operational reality** on 90–180+ day MM/Enterprise cycles. Deals stall across quarters. Champions go dark. Context dies when transcripts disappear.

### Historical Memory (privacy-safe)

Lazarus separates **raw dialogue** from **deal intelligence**:

| Layer | Retention | What's stored |
|-------|-----------|---------------|
| **Raw transcript text** | Configurable purge (default 30 days) | Full dialogue — privacy sandbox |
| **Structured deal memory** | **Full sales cycle** | DRI, viability, People Map, constraint vectors, stall points, rescue actions, outcomes |
| **Rescue outcomes** | Persistent | Anonymous metadata flywheel — no raw dialogue |

**Per-rep, per-deal longitudinal view:**

- How did buyer intent shift from discovery → eval → procurement?
- Which constraints were active at each touchpoint?
- Did DRI trend up or down — and did our rescue action work?

**Pitch line:** *"We don't hoard your recordings. We remember what mattered about the deal — for as long as the deal is open."*

### Enterprise configuration

- Extended or zero purge for transcript text (contract/DPA tier)
- Deal memory always on — structured JSON, RLS-isolated per tenant
- Audio processed in memory; never persisted by default

---

## Slide 7 — Why Now (ICP fit)

**Primary:** Fractional CRO / RevOps consultant managing 3–8 client orgs  
**Direct:** VP Sales / CRO · B2B SaaS · 30–200 employees · $25K–$150K ACV · 5–20 AEs

**Top buying signals:**

1. Missed or slipping forecast — no credible board story
2. Leadership doing manual deal forensics (listening to hour-long calls)
3. New revenue leadership rebuilding pipeline discipline

**Cycle fit:** 90–150 day cycles, 6–11 stakeholders — exactly where context loss kills deals.

---

## Slide 8 — Differentiation

| They say | We say |
|----------|--------|
| "We have Gong" | Gong records. Lazarus models constraints and tells you if the deal is recoverable — live or stalled. |
| "Reps won't adopt" | Buyer is the manager; triage and execution intel, not rep hygiene |
| "AI hallucinates" | Server-side grounding; DRI is deterministic compiler output |
| "Data retention?" | Raw text purges; structured deal memory persists for the cycle |
| "AI SDR" | Hard no — human-led, AI-assisted |

---

## Slide 9 — Proof / Demo Flow (10 min)

1. **Live capture** — field recording or call upload
2. **Stitch** — add email thread from a 4-month-old stall
3. **Intelligence brief** — forces, People Map, DRI, rescue plan
4. **Historical memory** — show prior touchpoint analysis (structured) alongside new capture; highlight intent drift
5. **CRM export** — compressed notes in <2 seconds

**Demo accounts:** `fixtures/sarah_mark_transcript.txt` (recoverable authority gap), `fixtures/transcript_3_federal_audit.txt` (structural lock)

---

## Slide 10 — Commercial

**Wedge:** One stalled deal → intelligence brief → pipeline review upgrade  
**Expand:** Per-rep historical memory across open pipeline  
**Partner:** White-label + multi-tenant dashboard for fractional CRO firms

**CTA:** 15-minute pipeline risk walkthrough — *"Send one live or stalled touchpoint."*

---

## Slide 11 — Roadmap (honest)

| Shipped / pilot-ready | In flight |
|-----------------------|-----------|
| Cross-channel stitch + field capture | Deal timeline UI (historical memory surface) |
| Deterministic DRI + rescue triage | Per-deal intent drift visualization |
| 30-day transcript purge + analysis JSON retention | Configurable enterprise retention tiers |
| Rescue outcome loop (metadata) | Partner multi-client dashboard |

---

## Appendix — Talk Track: Historical Memory Objection

**"If you purge transcripts, how do you remember my deal?"**

> We purge *raw dialogue* on a privacy schedule you control. What persists is structured deal intelligence — who's involved, what constraints were detected, how risk scored over time, and what rescue actions were taken. That's what you need in month 4 of a six-month cycle: not a recording vault, but a memory of what the buyer actually said and what blocked them. Enterprise customers can extend transcript retention via DPA; deal memory is always on.

---

## Appendix — Language to Retire / Adopt

| Retire as headline | Adopt |
|--------------------|-------|
| Deal autopsy tool | Live buyer execution engine |
| Post-mortem | Intelligence brief / execution brief |
| Forensics | Constraint modeling + intent tracking |
| Upload a stalled call | Capture a live or stalled touchpoint |

Keep "autopsy" and "recovery" in **recovery mode** and SEO — not as primary positioning.
