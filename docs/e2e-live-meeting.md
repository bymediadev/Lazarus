# Easy end-to-end test (no Marketplace)

Skip Zoom App Marketplace publishing. Use these two paths to prove Lazarus works for you and for a company testing.

## Path A — Fastest (no Zoom account)

Confirms judgment / autopsy without any integration.

1. Run `npm run dev` (API + UI).
2. Open the app → leave **Call Auto-Autopsy** selected.
3. Paste a sample from `fixtures/sarah_mark_transcript.txt` (or any real stalled-call transcript).
4. Click **Analyze**.
5. You should see risk, root cause, and recovery actions.

That’s a full product demo for value. No OAuth, no mic, no meeting.

---

## Path B — Live meeting (recommended full e2e)

Confirms live capture → Recovery Brief → post-call autopsy.

| Step | Where | What |
|------|--------|------|
| 1 | Browser | Chrome or Edge (mic captions). |
| 2 | Terminal | `npm run dev` — wait until API health is green in the header. |
| 3 | Lazarus → **Live Meeting** | Zoom is pre-selected. |
| 4 | Click **Start live session** | Mic turns on. Join your real Zoom/Meet/Teams call in another window. |
| 5 | During the call | Speak (mic) and/or paste lines like `Buyer: we need a DPA first`. Watch the Recovery Brief update. |
| 6 | Click **End & run analysis** | Session loads into Call Auto-Autopsy — run Analyze if it doesn’t start. |

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
