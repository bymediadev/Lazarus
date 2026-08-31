# Google Meet / Workspace / Gmail setup

Lazarus uses **Google OAuth** for Gmail thread search (`gmail.readonly`) and a **Chrome extension** for live Meet captions. Google has no Zoom-style RTMS feed. The extension reads Meet’s own captions — turn **Captions** on in the call. There is no bot in the meeting.

## 1. Live Meet captions (send-out)

### Sideload the extension

Chrome Web Store listing comes later. For demos, load the unpacked folder:

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → choose `extensions/meet-captions` in this repo (production `manifest.json` — no localhost)
4. **Local API only:** copy `manifest.dev.json` over `manifest.json`, then reload the extension. Do not ship the dev manifest.
5. Keep the extension enabled

### Run a live session

1. On [www.getldr.ca](https://www.getldr.ca) (or local Vite), open **Live** and select **Google Meet**
2. Click **Start live session** (pairs the extension automatically)
3. In Meet, turn on **Captions** (CC)
4. Caption lines stream into the Recovery Brief. Mic + paste still work if captions are off or the extension is missing

Local API default for the extension is `http://localhost:3001`. Production uses `https://lazarus-4uxi.onrender.com`.

## 2. Create a Google Cloud OAuth client (Gmail Connect)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create **OAuth client ID** (Web application)
3. Add **both** authorized redirect URIs:
   ```
   http://localhost:3001/api/integrations/google/callback
   https://lazarus-4uxi.onrender.com/api/integrations/google/callback
   ```
4. Enable APIs: **Gmail API**, **Google Calendar API**, **Google Meet API** (as available)
5. OAuth consent screen → add scope `https://www.googleapis.com/auth/gmail.readonly` (plus the Meet/profile scopes below)
6. If the app is in Testing, add your Gmail as a **test user**

### Scopes Lazarus requests

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/meetings.space.readonly`
- `https://www.googleapis.com/auth/gmail.readonly`

## 3. Environment variables

### Local `.env` (for `npm run dev`)

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3001/api/integrations/google/callback` |
| `FRONTEND_ORIGIN` | must include `http://localhost:5173` |

### Render (production)

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://lazarus-4uxi.onrender.com/api/integrations/google/callback` |
| `PUBLIC_API_URL` | `https://lazarus-4uxi.onrender.com` |

OAuth tokens persist in Supabase (`google_oauth_tokens`) so Connect survives Render restarts. A local `.data/google-tokens.json` file is only a cache.

## 4. Mailbox Search flow (one-shot evidence package)

1. Open **Mailbox Search**
2. **Connect Gmail** (popup — evidence package is preserved)
3. Ask: `Pull up the Spec Kitty thread` or `Look through my email for Acme`
4. Lazarus searches Gmail, expands matching **conversation threads**, and attaches them
5. Optionally add a call/PDF and HubSpot notes, then **Analyze Evidence Package**

## 5. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/google/status` |
| GET | `/api/integrations/google/connect` |
| GET | `/api/integrations/google/callback` |
| POST | `/api/integrations/google/disconnect` |
| POST | `/api/integrations/google/search-emails` |
| POST | `/api/integrations/google/import-emails` |
| POST | `/api/integrations/google/live-session/start` |
| POST | `/api/integrations/google/live-captions` |
| GET | `/api/integrations/google/live-transcript/stream` |

Health check includes `"google_meet": true` when client ID + secret are set. Live captions do not require Connect.
