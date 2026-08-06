# Lazarus HubSpot public OAuth app (developer project)

Public (`marketplace`) + **OAuth** boilerplate for Lazarus Deal Recovery.
Not a private/static app.

## Prerequisites

1. HubSpot CLI: `npm install -g @hubspot/cli --strict-ssl=false` (if TLS fails on Windows)
2. Authenticate the CLI with a **personal access key** (this only unlocks the CLI — it does **not** make the app private):

```powershell
hs auth --personal-access-key "pat-naX-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Create/copy a key at: https://app.hubspot.com/l/personal-access-key  
(Copy the **full** key starting with `pat-`.)

Or interactive:

```powershell
hs init
```

Do **not** put the personal access key in Lazarus `.env` as `HUBSPOT_CLIENT_ID`.

## Create / upload this project

From this folder after CLI auth:

```powershell
cd hubspot-app
hs project upload
hs project open
```

Then open **Auth** → copy **Client ID** and **Client secret** into Lazarus:

```powershell
cd ..
node scripts/apply-hubspot-env.mjs --id "<client_id>" --secret "<client_secret>"
```

Add the same three vars on Render (use the production redirect URI).

## Config already set

| Setting | Value |
|--------|--------|
| Distribution | `marketplace` (public) |
| Auth | `oauth` |
| Redirects | localhost:3001 + Render callback |
| Scopes | `oauth`, `crm.objects.deals.read` (`notes.read` is not recognized on platform 2026.03) |

See also: [`docs/hubspot-setup.md`](../docs/hubspot-setup.md)
