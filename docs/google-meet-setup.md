# Google Meet / Workspace setup

Lazarus Connect Google for Meet uses **Google OAuth**. Live caption auto-ingest is next; today mic + paste feeds the same **live Recovery Brief** pipe as Zoom and Teams.

## 1. Create a Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create **OAuth client ID** (Web application)
3. Add authorized redirect URI:
   ```
   https://lazarus-4uxi.onrender.com/api/integrations/google/callback
   ```
4. Enable APIs as needed: **Google Calendar API**, **Google Meet API** (when available for your project)

### Scopes Lazarus requests

- `openid`, `email`, `profile`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/meetings.space.readonly`

## 2. Environment variables

### Render

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://lazarus-4uxi.onrender.com/api/integrations/google/callback` |
| `PUBLIC_API_URL` | `https://lazarus-4uxi.onrender.com` |

### Local `.env`

Same keys (optional for Connect testing).

## 3. User flow

1. Live Meeting → **Google Meet**
2. **Connect Google Meet** → authorize
3. Land on `/?google=connected`
4. **Start live session** → mic/paste (or future caption stream) → live Recovery Brief

## 4. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/google/status` |
| GET | `/api/integrations/google/connect` |
| GET | `/api/integrations/google/callback` |
| POST | `/api/integrations/google/disconnect` |

Health check includes `"google_meet": true` when client ID + secret are set.
