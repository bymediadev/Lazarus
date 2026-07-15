# Zoom RTMS live transcripts — optional setup

Most tests should use **mic + paste** — see [`e2e-live-meeting.md`](./e2e-live-meeting.md).  
This guide is only if you want **automatic Zoom transcripts** via RTMS (private developer app, not Marketplace).

## Architecture

```
Zoom meeting → RTMS webhook → Lazarus API → SSE stream → Meeting Companion UI
                                      ↓
                              Live objection scan (Gemini)
```

On **Windows local dev**, RTMS native SDK does not run — use mic + paste. Full live Zoom transcripts work on **Render (Linux)**.

---

## 1. Create a Zoom developer app (private)

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/) → **Develop** → **Build App**
2. Choose **General App** (keep it unpublished)
3. Enable **Realtime Media Streams (RTMS)**
4. Set **Home URL**:
   ```
   https://lazarus-4uxi.onrender.com/
   ```
5. Add **Domain Allow List**: `lazarus-4uxi.onrender.com`
6. Add **OAuth redirect URL**:
   ```
   https://lazarus-4uxi.onrender.com/api/integrations/zoom/callback
   ```
   (Add `http://localhost:3001/api/integrations/zoom/callback` for local OAuth testing.)

### Required scopes

- `user:read:user`
- `meeting:read:meeting_transcripts`
- `meeting:update:participant_rtms_app_status`

### Webhooks

**Event notification endpoint URL:**
```
https://lazarus-4uxi.onrender.com/api/webhooks/zoom
```

**Subscribe to:**
- `meeting.rtms_started`
- `meeting.rtms_stopped`

Copy the **Secret Token** → `ZOOM_WEBHOOK_SECRET_TOKEN`

---

## 2. Environment variables

### Render (production)

| Variable | Value |
|---|---|
| `ZOOM_CLIENT_ID` | From Zoom app |
| `ZOOM_CLIENT_SECRET` | From Zoom app |
| `ZM_RTMS_CLIENT` | Same as `ZOOM_CLIENT_ID` |
| `ZM_RTMS_SECRET` | Same as `ZOOM_CLIENT_SECRET` |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Webhook secret token |
| `ZOOM_REDIRECT_URI` | `https://lazarus-4uxi.onrender.com/api/integrations/zoom/callback` |
| `PUBLIC_API_URL` | `https://lazarus-4uxi.onrender.com` |
| `FRONTEND_ORIGIN` | `https://lazarus-4uxi.onrender.com,http://localhost:5173` (**production URL first**) |

OAuth `state` is HMAC-signed (not stored in memory), so Render free-tier sleep/restart no longer causes `?zoom=error&reason=invalid_state`.

Redeploy after saving.

### Local `.env` (optional)

Same keys with localhost redirect URI if testing OAuth locally.

---

## 3. User flow (with RTMS)

1. Open Lazarus → **Live Meeting** → Zoom
2. Expand **Optional — Connect Zoom** → authorize
3. Click **Start live session** (before or as you join the meeting)
4. Join the Zoom meeting
5. RTMS transcripts stream if configured; otherwise mic/paste still works
6. **End & run analysis** → Call Auto-Autopsy

For the simple no-OAuth path, use [`e2e-live-meeting.md`](./e2e-live-meeting.md).

---

## 4. RTMS credits

Zoom RTMS requires **Developer Pack credits** on your Zoom account. See [Zoom RTMS pricing](https://developers.zoom.us/docs/rtms/).

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| "Connect Zoom" does nothing | Set `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` on server |
| OAuth redirect error | `ZOOM_REDIRECT_URI` must exactly match Zoom app settings |
| No live transcripts on Windows | Expected — deploy to Render; use mic/paste locally |
| No transcripts on Render | Verify webhook URL + `meeting.rtms_started` subscription |
| Webhook validation fails | Check `ZOOM_WEBHOOK_SECRET_TOKEN` matches Zoom dashboard |
| Unauthorized on live session | Set matching `LAZARUS_API_KEY` / `VITE_LAZARUS_API_KEY` |
