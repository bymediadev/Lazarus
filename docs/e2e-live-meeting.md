# Easy end-to-end test (no Marketplace)

Skip Zoom App Marketplace publishing. On the product page, use the **self-serve guide** (`#demo-test-guide`) beside the Security Battlecard — Path A (3 steps) then Path B (4 steps). Server/API status stays out of the visible flow.

You can also follow the manual paths below.

## Path A — Fastest (no Zoom account)

Confirms judgment / autopsy without any integration.

1. Paste a stalled-call transcript (or load the Sarah & Mark sample).
2. Click **Run Deal Analysis**.
3. Read the Recovery Brief (risk, root cause, next action).

That’s a full product demo for value. No OAuth, no mic, no meeting.

---

## Path B — Live meeting (recommended full e2e)

Confirms live capture → Recovery Brief → post-call autopsy.

| Step | Where | What |
|------|--------|------|
| 1 | Lazarus → **Live Meeting** | Zoom / Meet / Teams — same mic + paste flow. Prefer Chrome/Edge for captions. |
| 2 | Click **Start live session** | Allow mic. Join your real call in another window. |
| 3 | During the call | Speak and/or paste buyer lines. Watch the Recovery Brief update. |
| 4 | Click **End & run analysis** | Confirm the brief still tells you what to do next. |

**You do not need to Connect Zoom** for Path B. Connect is optional (collapsed under “Optional”) and only needed for automatic RTMS streaming on Render.

### Checklist — what “worked” means

- [ ] Live transcript shows turns (mic and/or paste)
- [ ] Live objections or Recovery Brief updates during the session
- [ ] End session lands on Call Auto-Autopsy with session text
- [ ] Analyze returns a score / brief

---

## Path C — Optional Zoom auto-transcript (later)

Only when you want RTMS streaming instead of mic/paste:

1. Env on server: see [`zoom-rtms-setup.md`](./zoom-rtms-setup.md) (developer app, not Marketplace listing).
2. Live Meeting → expand **Optional — Connect Zoom** → authorize.
3. **Start live session** *before* joining the Zoom meeting (stream only attaches while Lazarus session is live).
4. On Windows local: expect mic/paste; full RTMS is on Render (Linux).

Marketplace listing is parked — see notes in [`zoom-marketplace-listing.md`](./zoom-marketplace-listing.md).
