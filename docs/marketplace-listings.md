# Marketplace listings (submission kit)



OAuth for Google, Zoom, Teams, Salesforce, and HubSpot is already in the Lazarus API. This kit is **store presence**: listing copy, manifests, redirect URIs, and the buttons you click in each vendor dashboard.



**Packaged here ≠ approved.** Review queues are days to weeks. Salesforce AppExchange security review is a separate, often paid, process.



Canonical copy: [`marketplace/copy.md`](../marketplace/copy.md)  

Screenshot sizes: [`marketplace/screenshots.md`](../marketplace/screenshots.md)  

**Scope lock (do not exceed):** [`marketplace/allowed-scopes.json`](../marketplace/allowed-scopes.json)



Rebuild uploadable zips: `npm run marketplace:icons` then `npm run marketplace:package`



| Store | Upload artifact | You click |

|---|---|---|

| Google identity (OAuth consent **In production**) | No zip — identity client only | [oauth-production.md](../marketplace/google/oauth-production.md) |

| Chrome Web Store (Meet captions) | `marketplace/google/lazarus-deal-recovery-widget-meet.zip` | [chrome-web-store.md](../marketplace/google/chrome-web-store.md) |

| Google Workspace Marketplace | Scaffold only | [workspace-marketplace.md](../marketplace/google/workspace-marketplace.md) |

| Zoom Marketplace | `marketplace/zoom/lazarus-deal-recovery-widget-zoom.zip` — **listing assets only**, not an app package. Paste settings in the Zoom dashboard. | [zoom/listing.md](../marketplace/zoom/listing.md) |

| Microsoft Teams Store | `marketplace/teams/lazarus-deal-recovery-widget-teams.zip` | [teams/listing.md](../marketplace/teams/listing.md) |

| Salesforce Connected App | **No code zip** — Connected App in Setup; AppExchange is security review | [salesforce-setup.md](./salesforce-setup.md) · [salesforce/listing.md](../marketplace/salesforce/listing.md) |

| HubSpot Marketplace | `marketplace/hubspot/lazarus-hubspot.zip` and/or `hs project upload` | [hubspot/listing.md](../marketplace/hubspot/listing.md) |



## Redirect URIs (already in code)



| Provider | Local | Production |

|---|---|---|

| Google login + Connect | `http://localhost:3001/api/integrations/google/callback` | `https://lazarus-4uxi.onrender.com/api/integrations/google/callback` |

| Zoom | `http://localhost:3001/api/integrations/zoom/callback` | `https://lazarus-4uxi.onrender.com/api/integrations/zoom/callback` |

| Teams | `http://localhost:3001/api/integrations/teams/callback` | `https://lazarus-4uxi.onrender.com/api/integrations/teams/callback` |

| HubSpot | `http://localhost:3001/api/integrations/hubspot/callback` | `https://lazarus-4uxi.onrender.com/api/integrations/hubspot/callback` |

| Salesforce | `http://localhost:3001/api/integrations/salesforce/callback` | `https://lazarus-4uxi.onrender.com/api/integrations/salesforce/callback` |



Webhook URLs: Zoom `POST /api/webhooks/zoom` · HubSpot `POST /api/webhooks/hubspot` · Salesforce `POST /api/webhooks/salesforce`.



## Least privilege (must match the zip / dashboard)



Do not add scopes on a vendor form that are not in [`marketplace/allowed-scopes.json`](../marketplace/allowed-scopes.json). Extra scopes are the usual reason these stores reject or delay listing.

- Google **login**: `openid email profile` only. Not Gmail. Not in the Chrome zip.
- Chrome Web Store: `storage` + POST to `lazarus-4uxi.onrender.com`. Content scripts only on Meet and getldr.ca. No Google OAuth, no `<all_urls>`.
- Gmail Connect (optional, separate client): `gmail.readonly` (+ calendar/meet space read). Still **Testing** until Google restricted-scope verification.
- Zoom: `user:read:user`, `meeting:read:meeting_transcripts`, `meeting:update:participant_rtms_app_status`. No audio/video RTMS, no meeting bot.
- Teams Store zip: personal tab + meeting side panel. No bot, no `messageTeamMembers`, no Graph in the zip. Entra OAuth for Outlook is `User.Read` + `Mail.Read` only (no transcript.Read.All until that ships).
- HubSpot: `oauth`, `crm.objects.deals.read`, `crm.objects.deals.write`. No notes.* scopes (2026.03 rejects them). No contacts/companies.
- Salesforce: `api refresh_token offline_access` — opportunity search, import, user-clicked Push.

## Production secrets (fail closed)

On Render: `OAUTH_STATE_SECRET` and `TOKEN_ENCRYPTION_KEY` are required. OAuth tokens encrypt at rest (AES-256-GCM) and persist in Supabase (service role only; RLS denies `anon` / `authenticated`). `.data/*.json` is a local cache, not the production source of truth.
