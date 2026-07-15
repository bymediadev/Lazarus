# Lovable ↔ Local UI parity prompt

**Confirmed gap (2026-07-15):** Lovable (`lazarusdealrescue`) is still the older **Deal Rescue Console** (Calculator / Audio / Transcript). Local Cursor Lazarus is the full **Deal Judgment Layer** (CaptureStack, Call / Live Meeting / Email / Field tabs, DemoTestGuide Path A→B, Enterprise Trust). Bring Lovable to match local.

Paste the Prompt block into Lovable, or run via agent with this file attached.

---

## Prompt

```
SYNC TASK: Make this Lovable app UI match the local Lazarus (Cursor) product. Same screens, same labels, same pilot flow. Keep talking to the Render Express API — do not move scoring into Lovable.

Current Lovable is WRONG / OLD:
- Header says “DEAL RESCUE CONSOLE”
- Hero: “Secure deal autopsies for stalled pipeline…”
- Tabs: Calculator | Audio | Transcript only
- No Live Meeting, no CaptureStack, no Path A/B DemoTestGuide, no Field Capture / Email tabs

Target layout (top → bottom), dark navy + teal/emerald, monospace labels — match local:

1) Header
- Logo + “Lazarus” + tag “Deal Judgment Layer”
- Status: STANDBY / analysis state + Engine online when /api/health ok

2) HeroTrustBanner
- Eyebrow: Deal judgment layer · v1
- Headline: Keep Zoom or Gong. Add Lazarus on top. Know if the deal is still winnable — and why.
- Body: not another note-taker; score with fixed rules; human still runs the deal
- Bullets: problem / solution / guardrail
- Trust Pack text links (Privacy, Terms, DPA, Security Overview, Battlecard) → open `${VITE_API_URL}/api/trust-pack/{slug}` in new tab

3) CaptureStack
- Three layers: Capture → Lazarus → You
- Chips: Zoom, Meet, Teams (click → Live Meeting), Gong, Chorus, Otter, File upload
- Note + link Jump to step-by-step guide → #demo-test-guide

4) Workspace (two columns)
LEFT — Deal Intake
- Deal profile fields if you already have them (account / cycle / CRM JSON) — keep if present
- Tabs:
  - Call Auto-Autopsy (default): dropzone for recording + transcript textarea; deal value
  - Live Meeting: platform Zoom|Meet|Teams (default Zoom); Start live session WITHOUT requiring Connect Zoom; Connect Zoom/Meet/Teams under collapsed Optional; mic + paste notes; End & run analysis
  - Email Thread
  - Field Capture (simple recorder or file capture is fine)
- Run Deal Analysis → POST `${VITE_API_URL}/api/post-mortem` (FormData: recording, transcript, deal_value) with X-Api-Key; report object returned directly
RIGHT — Deal Score & Recovery Brief
- Empty / loading / report cards from API response
- If live session active, show a live triage / waiting brief placeholder (can call live triage later; for now show live transcript turns if available)

5) DemoTestGuide (#demo-test-guide) — REQUIRED for pilots
Beside a Security Battlecard card (opens trust-pack battlecard).
Path A (always on): ordered pizza steps, only current actionable, turn green:
  1 Server on  2 Call Auto-Autopsy  3 Load sample transcript button  4 Run analysis  5 Read brief
Path B LOCKED until Path A complete:
  1 Chrome/Edge  2 Server on  3 Live Meeting  4 Start session  5 Capture dialogue  6 End & analyze
Persist path-a / path-b done in localStorage.
Ikea-style SVG line art per step + written instructions + CTA buttons.

6) Enterprise Trust section
- Three pillars: Your data stays yours / Locked down by default / Each customer walled off
- Retention + recording consent + Trust Pack links

KEEP:
- VITE_API_URL + VITE_LAZARUS_API_KEY
- No second Gemini brain in Lovable
- No Zoom Marketplace listing work
- Dark theme aesthetic already in the app

REMOVE or demote:
- Calculator-as-primary tab (if Calculator stays, bury it — not the main pilot path)
- Old “DEAL RESCUE CONSOLE” / “Secure deal autopsies…” hero copy

SMOKE:
1. Hero + CaptureStack + four intake tabs visible
2. DemoTestGuide Path B locked until Path A green
3. Load sample → Run Analysis hits Render and shows report
4. Battlecard opens from guide side card
5. Live Meeting Start works without Connect Zoom
```

---

## Quick compare

| Surface | Local (Cursor/Render) | Lovable (today) |
|---------|----------------------|-----------------|
| Product name | Deal Judgment Layer | Deal Rescue Console |
| Intake tabs | Call / Live / Email / Field | Calculator / Audio / Transcript |
| Self-serve Path A→B | Yes (`DemoTestGuide`) | No |
| Live Meeting | Yes | No |
| Capture stack | Yes | No |
| API | Render Express | Wired (keep) |

Local is source of truth until Lovable matches.
