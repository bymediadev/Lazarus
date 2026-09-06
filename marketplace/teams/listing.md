# Teams Store — app package + Partner Center

Entra OAuth (Outlook / Graph) is already in Lazarus. This folder is the **Teams app package** required to submit to Partner Center.

The zip is limited to what the Teams Store will accept for a companion tab that already ships:

- Personal tab + meeting side panel loading `https://www.getldr.ca/portal`
- No bot, no chat (`messageTeamMembers` removed), no Teams SSO (`webApplicationInfo` omitted until SSO ships)
- No channel/team configurable tab (that would require manifest 1.25+ as of July 2026)
- Live Graph transcript auto-pull is **not** in this package and **not** in Entra scopes

Package layout:

```
marketplace/teams/
  manifest.json
  color.png      (192×192)
  outline.png    (32×32)
  listing.md     (this file)
```

Zip for upload: `npm run marketplace:package` → `marketplace/teams/lazarus-deal-recovery-widget-teams.zip`

Upload this zip to the Teams Developer Portal / Partner Center only. Do not upload it to Chrome or Zoom, and do not put the Meet extension inside this package.

Scope lock: [`marketplace/allowed-scopes.json`](../allowed-scopes.json)

## Honest claims

- The tab is the Lazarus companion. Mic + paste (and Outlook thread search from the website) are what you may describe.
- Connect Teams on getldr.ca is Entra OAuth: `User.Read` + `Mail.Read` only. That consent is not this zip.

## Manifest `id`

`manifest.json` `id` is the Entra **Application (client) ID** `7f48e5c6-6e16-47ea-a5a4-513fd4989e0c` (multi-tenant / AzureADMultipleOrgs). `npm run marketplace:package` with `TEAMS_CLIENT_ID` set stamps the same GUID into the zip.

Redirect URIs stay on the Lazarus API (`/api/integrations/teams/callback`) for website OAuth — not Teams SSO. Do not add `webApplicationInfo` until Teams SSO ships.

Azure Object ID (not in the zip): `228965af-0637-41dc-9a75-9d9b49130166`.

## Listing copy

From [`marketplace/copy.md`](../copy.md). Store name: **Lazarus Deal Recovery Widget**. Short add-on: “Open Lazarus Deal Recovery Widget beside a Teams meeting for recoverable vs flat no — keep Teams; Lazarus is the judgment layer.”

Privacy: https://www.getldr.ca/privacy

## Screenshots (Partner Center wants 1366×768)

Use these letterboxed files — not the 1280×800 store shots, and not Zoom/Meet captures:

```
marketplace/teams/screenshots/01-home-1366x768.jpg
marketplace/teams/screenshots/02-example-brief-1366x768.jpg
marketplace/teams/screenshots/03-login-1366x768.jpg
marketplace/teams/screenshots/05-security-1366x768.jpg
```

Do not upload `04-live-meet.jpg` or `06-zoom-live.jpg` to the Teams listing.

## You click

1. Microsoft Partner Center seller account (create this yourself if missing).
2. Teams Developer Portal → import `lazarus-deal-recovery-widget-teams.zip`, then Partner Center to submit to the store.
3. Publisher verification if prompted.
4. Submit. Review is not same-day.

Admin consent for `Mail.Read` still happens in Entra when a user clicks Connect on the Lazarus website. The store listing does not replace that.
