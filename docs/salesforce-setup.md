# Salesforce setup (opportunity import + human-confirmed Push)

Lazarus uses a **Salesforce Connected App** (OAuth). There is no managed package in this repo. AppExchange listing is a later security-review process — see [`marketplace/salesforce/listing.md`](../marketplace/salesforce/listing.md).

What ships today: Connect → search opportunities the user picks → import Chatter/feed notes into Deal Profile → run the score (live + upload + mailbox stack in) → **Push** a recovery note they clicked. Not unattended write-back. Not bidirectional sync.

## Scopes (do not add more)

Match [`marketplace/allowed-scopes.json`](../marketplace/allowed-scopes.json):

- `api`
- `refresh_token`
- `offline_access`

Do not add Full Access, Chatter extra scopes, or custom Apex.

## 1. Connected App

In your Salesforce org: **Setup → App Manager → New Connected App**.

| Field | Value |
|---|---|
| Enable OAuth Settings | On |
| Callback URLs (both) | `http://localhost:3001/api/integrations/salesforce/callback` |
| | `https://lazarus-4uxi.onrender.com/api/integrations/salesforce/callback` |
| Selected OAuth Scopes | `api`, `refresh_token`, `offline_access` |
| Require Secret for Web Server Flow | On |

Copy **Consumer Key** (Client ID) and **Consumer Secret**.

For sandbox testing, set `SALESFORCE_LOGIN_URL=https://test.salesforce.com`. Production default is `https://login.salesforce.com`.

## 2. Environment variables

### Local `.env`

| Variable | Value |
|---|---|
| `SALESFORCE_CLIENT_ID` | Consumer Key |
| `SALESFORCE_CLIENT_SECRET` | Consumer Secret |
| `SALESFORCE_REDIRECT_URI` | `http://localhost:3001/api/integrations/salesforce/callback` |

### Render

Same Client ID / Secret, with:

`SALESFORCE_REDIRECT_URI=https://lazarus-4uxi.onrender.com/api/integrations/salesforce/callback`

Redeploy until `/api/health` shows `"salesforce": true`. Production already reports that.

Optional: `SALESFORCE_WEBHOOK_SECRET` for `POST /api/webhooks/salesforce` (owner-linked opportunity refresh only).

Tokens: `.data/salesforce-tokens.json` (do not commit).

## 3. Demo flow (Deal Profile)

1. Sign in → **CRM import** → **Connect Salesforce**
2. Search an opportunity → **Import**
3. Add a live meeting, upload, or mailbox thread on the same deal
4. Run the score
5. **Push to Salesforce** — writes the recovery brief as a Chatter TextPost on that opportunity. Lazarus does not write until you click.

## 4. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/salesforce/status` |
| GET | `/api/integrations/salesforce/connect` |
| GET | `/api/integrations/salesforce/callback` |
| POST | `/api/integrations/salesforce/disconnect` |
| POST | `/api/integrations/salesforce/search-opportunities` |
| POST | `/api/integrations/salesforce/import-opportunity` |
| POST | `/api/integrations/salesforce/push-note` |
