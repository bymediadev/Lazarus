# HubSpot Marketplace — upload + listing

Boilerplate: [`hubspot-app/`](../../hubspot-app/). Zip (same tree as CLI upload): `npm run marketplace:package` → `marketplace/hubspot/lazarus-hubspot.zip`

Copy: [`marketplace/copy.md`](../copy.md)
Scope lock: [`marketplace/allowed-scopes.json`](../allowed-scopes.json) — `hubspot` array only.

## Scopes (must match the Lazarus server)

The HubSpot project (`app-hsmeta.json`) and `HUBSPOT_OAUTH_SCOPES` both request:

- `oauth`
- `crm.objects.deals.read` — search + import deals / associated notes
- `crm.objects.deals.write` — user-clicked Push onto the deal

Do **not** add `crm.objects.notes.read` or `crm.objects.notes.write` (HubSpot developer platform 2026.03 rejects both).
Do **not** add contacts, companies, tickets, or content scopes.

`permittedUrls.fetch` is only `https://api.hubapi.com`. No HubSpot UI cards/iframes in this package.

Push is a button the user clicks. Do not describe autonomous CRM write-back on the listing.

## Support URLs

- Email: `support@getldr.ca`
- Docs / support site: `https://www.getldr.ca`
- Phone: set your real E.164 number (`+1…`) in HubSpot’s listing form if they require it. Do not put a 555 placeholder in `app-hsmeta.json`.

## You click

```powershell
cd hubspot-app
hs project upload
hs project open
```

Or keep a copy of `marketplace/hubspot/lazarus-hubspot.zip` as the reviewed tree. Then HubSpot developer → marketplace listing form: name **Lazarus Deal Recovery**, paste copy from `marketplace/copy.md`, screenshots per [`marketplace/screenshots.md`](../screenshots.md), privacy `https://www.getldr.ca/privacy`.

Copy Client ID / secret to Render (`HUBSPOT_CLIENT_*`) if this upload rotates them. Redirects in hsmeta already include localhost + Render (HubSpot allows `http://localhost` for testing).
