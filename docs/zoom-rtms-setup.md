# Zoom RTMS live transcripts — setup guide

Lazarus uses **Zoom Realtime Media Streams (RTMS)** to pull **live diarized transcripts** into the Meeting Companion during calls. Meet and Teams follow after the Zoom pilot.

## Architecture

```
Zoom meeting → RTMS webhook → Lazarus API → SSE stream → Meeting Companion UI
                                      ↓
                              Live objection scan (Gemini)
```

On **Windows local dev**, RTMS native SDK does not run — use mic + paste fallback. Full live Zoom transcripts work on **Render (Linux)**.

---

## 1. Create a Zoom app

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/) → **Develop** → **Build App**
2. Choose **General App**
3. Enable **Realtime Media Streams (RTMS)**
4. Set **Home URL** (required by Zoom Apps):
   ```
   https://lazarus-4uxi.onrender.com/
   ```
   Lazarus serves OWASP Secure Headers on HTML responses (`Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `Referrer-Policy`). Redeploy after that code is on `main`, or Zoom will reject the Home URL.
5. Add **Domain Allow List** entry: `lazarus-4uxi.onrender.com`
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
| `PUBLIC_API_URL` | `https://lazarus-4uxi.onrender.com` (OAuth callback host) |
| `FRONTEND_ORIGIN` | `https://www.getldr.ca,http://localhost:5173` |

After Zoom authorize, Lazarus redirects to `https://www.getldr.ca`. Callback URLs stay on Render (`PUBLIC_API_URL`). If you land on `localhost:5173` in production, those env vars are missing or `NODE_ENV` is not `production`.

OAuth `state` is HMAC-signed (not stored in memory), so Render free-tier sleep/restart no longer causes `?zoom=error&reason=invalid_state`.

Redeploy after saving.

### Local `.env` (optional)

Same keys with localhost redirect URI if testing OAuth locally.

---

## 3. User flow

1. Open Lazarus → **Live Meeting** tab → select **Zoom**
2. Click **Connect Zoom** → authorize in Zoom
3. Click **Start live session**
4. Join your Zoom meeting (enable live transcription in Zoom if prompted)
5. RTMS transcripts stream into the panel; objections auto-scan every 22s
6. **End & run post-call analysis** → full deal autopsy

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

---

## Next: Google Meet & Teams

After Zoom pilot validation:
- **Meet** — Google Workspace Meet API / live captions (TBD)
- **Teams** — Microsoft Graph online meeting transcripts (TBD)
