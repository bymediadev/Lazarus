# Zoom Marketplace — publish packet



Backend and OWASP Home URL headers already ship. **Zoom does not take a code zip** for General App + RTMS.

Listing-assets packet: `npm run marketplace:package` → `marketplace/zoom/lazarus-deal-recovery-widget-zoom.zip` (icons, screenshots, `app-settings.json`, `scopes.json`). Open that zip for the dashboard fields. **Do not upload it — or the Meet/Teams zips — as an app package on marketplace.zoom.us.**

Copy: [`marketplace/copy.md`](../copy.md)  
Scope lock: [`marketplace/allowed-scopes.json`](../allowed-scopes.json) — `zoom` array only.

## App settings (already documented in `docs/zoom-rtms-setup.md`)

| Field | Value |
|---|---|
| App type | General App + Realtime Media Streams |
| Home URL | `https://lazarus-4uxi.onrender.com/` |
| Domain allow list | `lazarus-4uxi.onrender.com` |
| OAuth redirect | `https://lazarus-4uxi.onrender.com/api/integrations/zoom/callback` |
| Event notification | `https://lazarus-4uxi.onrender.com/api/webhooks/zoom` |
| Events | `meeting.rtms_started`, `meeting.rtms_stopped` |

### Scopes (dashboard + authorize URL — do not add more)

- `user:read:user`
- `meeting:read:meeting_transcripts`
- `meeting:update:participant_rtms_app_status`

Do **not** add `meeting:read:meeting_audio`, `meeting:read:meeting_video`, recording archive scopes, or a meeting bot. Lazarus consumes live **transcript** RTMS turns only.

## Listing copy (paste)

**Name:** Lazarus Deal Recovery Widget  
**Short:** Forecast judgment on live Zoom calls — recoverable vs flat no, without a meeting bot.

**Long:** Use the one-liner + long description from `marketplace/copy.md`. Add: Lazarus consumes **live RTMS transcript turns** during a session the user starts. We are not a Zoom recording archive and we do not inject a note-taker participant.

**Privacy / support / terms:** getldr.ca URLs in `marketplace/copy.md`.

**Category:** Sales / Productivity

## Screenshots

1280×800: Live tab with Zoom selected, Recovery Brief visible, no customer PII. Spec in [`marketplace/screenshots.md`](../screenshots.md).

## You click

1. [Zoom Marketplace](https://marketplace.zoom.us/) → Develop → your General App.
2. Confirm Home URL, allow list, redirect, webhook secret → `ZOOM_WEBHOOK_SECRET_TOKEN` on Render.
3. On **Scopes**, enable only the three above. Remove anything else before submit.
4. RTMS **Developer Pack credits** must be on the Zoom account.
5. Marketplace listing → Submit for review.

Do not claim an in-meeting Zoom Apps sidebar until that shell ships; Home URL currently serves the API origin with OWASP headers so Zoom will accept the app.
