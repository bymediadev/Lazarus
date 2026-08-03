# Monika — Historical Memory Operational Test

> **INTERNAL ONLY** — test plan. Not a customer-facing commitment.

**Date:** Today (Jul 9, 2026)  
**Goal:** Validate whether privacy-safe historical deal memory solves the 30-day cap problem for long MM/Enterprise cycles — without weakening the privacy story.

**Duration:** 30–45 minutes

---

## Hypothesis

Reps and managers on 6+ month cycles lose deal context when raw transcripts purge at 30 days. **Structured deal memory** (analysis JSON, DRI, People Map, constraint vectors, rescue outcomes) is sufficient for pipeline review and next-action decisions — and is a stronger privacy posture than indefinite recording storage.

---

## Setup (5 min)

Pick **one real or realistic long-cycle deal** Monika knows well:

- [ ] 90+ days in pipeline (ideally 4–6+ months)
- [ ] Multiple touchpoints (≥2 calls and/or email thread)
- [ ] At least one stall or champion-dark period
- [ ] ACV in MM range ($25K–$150K) if possible

**Materials:**

- Lazarus dev instance (`npm run dev`) or staging
- Prior touchpoint: transcript, recording, or email thread
- Current touchpoint: most recent call notes or field capture
- Optional deep-context fixture: `fixtures/sample_deep_context.json` (186-day cycle with Sarah/Dave veto history)

---

## Test A — Baseline pain (5 min)

Ask Monika to walk through her **current workflow** on this deal without Lazarus:

1. Where does context live today? (CRM notes, Gong, inbox, rep's head)
2. What happened the last time she re-opened a deal that went quiet for 60+ days?
3. What did she **wish she still had** from month 1 — transcript, or something else?

**Capture verbatim quotes** — these become pitch language.

---

## Test B — Live execution (10 min)

Run **today's touchpoint** through Lazarus:

1. Upload / field-capture latest call OR paste transcript
2. Optionally stitch email thread (`App.tsx` → Email tab)
3. Review intelligence brief: forces, People Map, DRI, rescue triage
4. Export CRM notes (`formatCompressedCrmNotes`)

**Observe:**

- [ ] Time to actionable next step
- [ ] Does output match Monika's read of buyer intent?
- [ ] Anything missing that she'd need from the live meeting?

---

## Test C — Historical memory (15 min)

Simulate **long-cycle context** by running a **prior touchpoint** (weeks/months ago), then the **current touchpoint** separately.

Compare manually (timeline UI not required for this test):

| Dimension | Touchpoint 1 (older) | Touchpoint 2 (current) | Drift? |
|-----------|----------------------|------------------------|--------|
| Primary constraint | | | |
| Buyer intent signal | | | |
| People Map / veto-holder | | | |
| DRI / viability | | | |
| Recommended next action | | | |

**Key questions for Monika:**

1. Is **structured memory** (no raw transcript) enough to run a pipeline review on this deal?
2. What would she still need the **full transcript** for — if anything?
3. Would she trust this for a **board / forecast conversation**? What's missing?
4. Per-rep memory across open deals: would she use a **deal timeline** weekly?

---

## Test D — Privacy tradeoff (5 min)

Walk through the retention model:

- Raw transcript: 30-day purge (default)
- Structured analysis: retained for deal lifecycle
- Audio: processed in memory, not stored

**Ask:**

- [ ] Does this feel **more** or **less** acceptable than Gong-style indefinite storage?
- [ ] Would her InfoSec / legal team approve structured memory without raw text?
- [ ] What retention window would she **pay extra** for on transcript text? (60 / 90 / 180 days / full cycle)

---

## Success Criteria

| Signal | Pass | Fail |
|--------|------|------|
| Monika can name next action from structured memory alone | ✓ | Needs full transcript every time |
| She sees value in intent **drift** across touchpoints | ✓ | "Just give me summaries" |
| Privacy story holds | ✓ | "This still feels like surveillance" |
| Operational blocker identified | Document gap | — |

---

## Debrief Prompts (capture notes)

1. **One sentence:** What is Lazarus to you after this — autopsy tool or execution engine?
2. **Historical memory:** Must-have, nice-to-have, or don't care?
3. **Blocker:** What's the one thing that would stop her from using this on her real pipeline Monday?
4. **James pitch:** What slide would she show her VP Sales?

---

## Output Template

```markdown
## Monika Test — [date]

**Deal profile:** [name/industry/ACV/cycle length]

**Baseline pain quote:** "..."

**Live execution:** [pass/partial/fail] — [notes]

**Historical memory:** [pass/partial/fail] — [notes]

**Privacy acceptance:** [yes/conditional/no] — [conditions]

**Intent drift value:** [high/medium/low]

**Recommendation:** [ship timeline UI / extend retention tier / reposition only / other]

**Quote for deck:** "..."
```
