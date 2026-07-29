# Google Meet / Workspace / Gmail setup

Lazarus uses **Google OAuth** for Meet/Workspace connect and **Gmail thread search** (`gmail.readonly`).

## 1. Create a Google Cloud OAuth client

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

## 2. Environment variables

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

## 3. Mailbox Search flow (one-shot evidence package)

1. Open **Mailbox Search**
2. **Connect Gmail** (popup — evidence package is preserved)
3. Ask: `Pull up the Spec Kitty thread` or `Look through my email for Acme`
4. Lazarus searches Gmail, expands matching **conversation threads**, and attaches them
5. Optionally add a call/PDF and HubSpot notes, then **Analyze Evidence Package**

## 4. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/google/status` |
| GET | `/api/integrations/google/connect` |
| GET | `/api/integrations/google/callback` |
| POST | `/api/integrations/google/disconnect` |
| POST | `/api/integrations/google/search-emails` |
| POST | `/api/integrations/google/import-emails` |

Health check includes `"google_meet": true` when client ID + secret are set.
