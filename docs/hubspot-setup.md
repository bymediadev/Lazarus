# HubSpot setup (read-only deal notes)

Lazarus uses **HubSpot OAuth** for Connect → search deals → import associated notes into Deal Profile (historical CRM context). Read-only — no CRM writes.

**Public app** = `distribution: marketplace` + `auth: oauth`  
**Not** a private/static app (those use a static token for one portal).

Boilerplate project lives in [`hubspot-app/`](../hubspot-app/) (ready to `hs project upload` after CLI auth).

## Keys you will see (do not mix them up)

| Credential | Purpose | Goes in Lazarus `.env`? |
|---|---|---|
| **Personal access key** (`pat-na…`) | Authenticate HubSpot CLI only | No |
| **Client ID** + **Client secret** | Lazarus Connect HubSpot OAuth | Yes (`HUBSPOT_CLIENT_*`) |

## 1. Authenticate the HubSpot CLI

`hs project create` / `hs project upload` fail with **No accounts found** until this succeeds.

```powershell
hs auth --personal-access-key "pat-naX-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Or: open https://app.hubspot.com/l/personal-access-key → copy the full key → `hs init`

Keep `hubspot.config.yml` out of git (already gitignored). Prefer storing it in your home directory if the CLI warns.

## 2. Upload the public OAuth boilerplate

```powershell
cd hubspot-app
hs project upload
hs project open
```

Or create fresh (same settings):

```powershell
hs project create --name lazarus-deal-recovery --dest hubspot-app --project-base app --distribution marketplace --auth oauth --platform-version 2026.03
```

Then set redirect URLs + scopes in `src/app/app-hsmeta.json` to match this repo’s boilerplate.

### Scopes (required)

- `oauth`
- `crm.objects.deals.read`

Do **not** add `crm.objects.notes.read` — HubSpot developer platform 2026.03 rejects it on deploy. Deal-associated notes are read under deals.read.

```
http://localhost:3001/api/integrations/hubspot/callback
https://lazarus-4uxi.onrender.com/api/integrations/hubspot/callback
```

### If `crm.objects.notes.read` is missing

Search for **notes** under CRM object scopes. Do **not** add write or contacts/companies scopes for the beta connector.

## 3. Environment variables

After upload, in HubSpot: project → app → **Auth** → copy Client ID + Client secret.

### Local `.env`

| Variable | Value |
|---|---|
| `HUBSPOT_CLIENT_ID` | App Client ID |
| `HUBSPOT_CLIENT_SECRET` | App Client secret |
| `HUBSPOT_REDIRECT_URI` | `http://localhost:3001/api/integrations/hubspot/callback` |

```powershell
node scripts/apply-hubspot-env.mjs --id <client_id> --secret <client_secret>
```

### Render

Same Client ID/Secret, with:

`HUBSPOT_REDIRECT_URI=https://lazarus-4uxi.onrender.com/api/integrations/hubspot/callback`

Redeploy until `/api/health` shows `"hubspot": true`.

## 4. Demo flow (Deal Profile)

1. **Connect HubSpot**
2. Deal dropdown loads recent CRM deals (filter/refresh optional)
3. Choose a deal → **Add deal as context** (notes + stage → Deal Profile)
4. Add another source → **Analyze Evidence Package**

Tokens: `.data/hubspot-tokens.json` (do not commit).

## 5. Live smoke

```bash
npm run test:hubspot:live
```

## 6. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/hubspot/status` |
| GET | `/api/integrations/hubspot/connect` |
| GET | `/api/integrations/hubspot/callback` |
| POST | `/api/integrations/hubspot/disconnect` |
| GET | `/api/integrations/hubspot/list-deals` |
| POST | `/api/integrations/hubspot/search-deals` |
| POST | `/api/integrations/hubspot/import-deal-notes` |
