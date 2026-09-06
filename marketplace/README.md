# Marketplace upload packets

Rebuild with `npm run marketplace:package`. Do not mix these zips across stores.

| Platform | Zip | Upload where |
|---|---|---|
| Google Meet | `google/lazarus-deal-recovery-widget-meet.zip` | Chrome Web Store only |
| Microsoft Teams | `teams/lazarus-deal-recovery-widget-teams.zip` | Teams Developer Portal / Partner Center only |
| Zoom | `zoom/lazarus-deal-recovery-widget-zoom.zip` | Listing assets only — paste settings, upload icons/screenshots. **Not** an app package |

Store listing name on all three: **Lazarus Deal Recovery Widget**.

Shared copy and scope lock: [`copy.md`](./copy.md), [`allowed-scopes.json`](./allowed-scopes.json).

Never upload the Meet zip to Zoom or Teams, or the Teams zip to Chrome or Zoom. Extra scopes and the wrong artifact are the usual rejection reasons.
