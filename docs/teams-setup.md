# Microsoft Teams / Entra ID setup

Lazarus Connect Teams uses **Microsoft Entra ID (Azure AD)** + **Microsoft Graph**. Online meeting transcript auto-pull is **not shipped**; today mic + paste feeds the same **live Recovery Brief** pipe as Zoom and Google Meet.

Teams Store package: [`marketplace/teams/lazarus-deal-recovery-widget-teams.zip`](../marketplace/teams/listing.md) via `npm run marketplace:package`. Personal tab + meeting side panel only — no bot, no Graph transcript scopes in the zip. Listing name: **Lazarus Deal Recovery Widget**.

## 1. Register an Azure app

1. Open [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: `Lazarus`
3. Supported account types: single tenant (or multi-tenant if needed)
4. Redirect URI (Web):
   ```
   https://lazarus-4uxi.onrender.com/api/integrations/teams/callback
   ```
5. **Certificates & secrets** → create a client secret; copy the value
6. **API permissions** (Delegated) → add only what the product uses today:
   - `User.Read`
   - `Mail.Read` (Outlook thread search the user starts)
   - `openid`, `profile`, `email`, `offline_access`
7. Do **not** add `OnlineMeetings.Read` or `OnlineMeetingTranscript.Read.All` until Graph live transcript ships. Store listing and this Entra app must match.

## 2. Environment variables

### Render

| Variable | Value |
|---|---|
| `TEAMS_CLIENT_ID` | Application (client) ID |
| `TEAMS_CLIENT_SECRET` | Client secret value |
| `TEAMS_TENANT_ID` | Directory (tenant) ID — or `common` for multi-tenant |
| `TEAMS_REDIRECT_URI` | `https://lazarus-4uxi.onrender.com/api/integrations/teams/callback` |
| `PUBLIC_API_URL` | `https://lazarus-4uxi.onrender.com` |

Aliases also accepted: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`.

## 3. User flow

1. Live Meeting → **Microsoft Teams**
2. **Connect Microsoft Teams** → authorize
3. Land on `/?teams=connected`
4. **Start live session** → mic/paste (or future Graph transcript) → live Recovery Brief

## 4. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/teams/status` |
| GET | `/api/integrations/teams/connect` |
| GET | `/api/integrations/teams/callback` |
| POST | `/api/integrations/teams/disconnect` |

Health check includes `"teams": true` when client ID + secret are set.
