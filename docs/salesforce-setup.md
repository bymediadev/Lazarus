# Salesforce setup (opportunity import + human-confirmed Push)

Lazarus uses **Salesforce OAuth** so a signed-in user can Connect an org, search Opportunities, import feed notes into Deal Profile, and optionally **Push** a CRM note they reviewed. REST API v59.0 (`query` + `sobjects`). Not Lightning UI API. Not Agentforce.

**Listing path:** AgentExchange **app** (forecast judgment). Not an Agentforce agent, topic, or MCP server.

Scopes (lock): `api` `refresh_token` `offline_access` — see [`marketplace/allowed-scopes.json`](../marketplace/allowed-scopes.json). Do not add Full Access, Chatter, or custom Apex.

## What is live today

Production (`https://lazarus-4uxi.onrender.com/api/health`) reports `salesforce: true` when `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET` are set. That is the Connected App / External Client App **credentials**, not a customer org session.

Connection is per Lazarus user. Confirm in the product: Deal Profile → Salesforce → connected email, or `GET /api/integrations/salesforce/status` while signed in.

Tokens: encrypted `.data/salesforce-tokens.json` (local cache). Unlike Google, Salesforce tokens are **not** dual-written to Supabase yet — a Render restart can drop Connect until the user re-authorizes. Fix that before security review.

`error=invalid_client_id` means Salesforce does not recognize the Consumer Key on Render. Health `salesforce: true` only means the env vars are non-empty. AgentExchange, a new Developer Edition signup, and Partner trial orgs do not fix that.

`error=missing required code challenge` means the Consumer Key is valid and the ECA requires PKCE. Lazarus must send `code_challenge` on authorize (this is in the API code; production needs a deploy). Do not create a new ECA for this error.

## 1. Create the OAuth app (External Client App)

Spring ’26 blocked **new** Connected Apps. Create an **External Client App (ECA)** in a Partner / Dev org — the same org you will log into to copy credentials.

1. Log into that org → gear → **Setup** → Quick Find **External Client App Manager**.
2. Open the Lazarus ECA (or **New External Client App**). Enable **OAuth**. Callback URLs (one per line):

```
https://api.getldr.ca/api/integrations/salesforce/callback
https://lazarus-4uxi.onrender.com/api/integrations/salesforce/callback
http://localhost:3001/api/integrations/salesforce/callback
```

Production currently sends the `api.getldr.ca` URL. If it is missing here, login fails after Salesforce accepts the client id.

3. Selected OAuth scopes: **api**, **refresh_token**, **offline_access** only.
4. Confidential client (web server flow). **Require secret** for web server + refresh. **PKCE** is required on this ECA (often checked, disabled, and org-locked). Lazarus sends `code_challenge` / `code_verifier`. Leave refresh-token rotation and idle TTL as the org locked them.
5. OAuth policies: **Permitted Users** = All users may self-authorize (required for Sign in with Salesforce). Save.
6. Settings → **Consumer Key and Secret** → copy Consumer Key → `SALESFORCE_CLIENT_ID`, Consumer Secret → `SALESFORCE_CLIENT_SECRET`. Paste into Render with no quotes or spaces. Wait 10–20 minutes after first save before testing.
7. Login URL: `https://login.salesforce.com` (production / DE orgs) or `https://test.salesforce.com` (sandboxes). Set `SALESFORCE_LOGIN_URL` to match.

Do not recreate the ECA to “turn PKCE off.” The Consumer Key is valid; `missing required code challenge` means authorize must include PKCE, which production needs a deploy of this code to send.

## 2. Environment variables

### Local `.env`

| Variable | Value |
|---|---|
| `SALESFORCE_CLIENT_ID` | ECA Consumer Key |
| `SALESFORCE_CLIENT_SECRET` | ECA Consumer Secret |
| `SALESFORCE_REDIRECT_URI` | `http://localhost:3001/api/integrations/salesforce/callback` |
| `SALESFORCE_LOGIN_URL` | `https://login.salesforce.com` |
| `SALESFORCE_WEBHOOK_SECRET` | Optional inbound webhook; fail-closed if unset |

### Render

Same Client ID/Secret, with:

```
SALESFORCE_REDIRECT_URI=https://api.getldr.ca/api/integrations/salesforce/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com
```

Keep the onrender.com callback listed on the ECA as a fallback. Redeploy until `/api/health` shows `"salesforce": true`, then click **Salesforce** on [www.getldr.ca/login](https://www.getldr.ca/login). Success is the Salesforce allow screen, not `invalid_client_id` or `missing required code challenge`.

## 3. Demo flow (Deal Profile)

1. Sign in to Lazarus → **Connect Salesforce** (popup) → approve in the org.
2. Search an opportunity → **Import** notes.
3. Run analysis → **Push to Salesforce** (human click). Or copy the brief and paste.

Webhook (optional): `POST /api/webhooks/salesforce` with `X-Webhook-Secret` matching `SALESFORCE_WEBHOOK_SECRET`. Body must include `opportunityId` (or `Id`) for a deal already linked to a Lazarus user.

## 4. Endpoints

| Method | Path |
|---|---|
| GET | `/api/integrations/salesforce/status` |
| GET | `/api/integrations/salesforce/connect` (login) |
| POST | `/api/integrations/salesforce/connect` (logged-in Connect) |
| GET | `/api/integrations/salesforce/oauth-start` (sets PKCE cookie, then redirects to Salesforce) |
| GET | `/api/integrations/salesforce/callback` |
| POST | `/api/integrations/salesforce/disconnect` |
| POST | `/api/integrations/salesforce/search-opportunities` |
| POST | `/api/integrations/salesforce/import-opportunity` |
| POST | `/api/integrations/salesforce/push-note` |
| POST | `/api/webhooks/salesforce` |

## 5. AgentExchange listing (app path)

Salesforce’s store is [AgentExchange](https://www.salesforce.com/agentforce/agentexchange/) (AppExchange + Slack + Agentforce in one catalog). Lazarus lists as a **Sales Cloud app**: import a stalled opportunity, return recoverable vs flat no, Push a note the user confirms.

**Do not** list as an Agentforce agent, SDR, or autonomous closer. That contradicts product positioning and overclaims what the code does.

Listing copy: [`marketplace/salesforce/listing.md`](../marketplace/salesforce/listing.md) · shared blurb: [`marketplace/copy.md`](../marketplace/copy.md).

### Partner steps (you click)

1. Join [Salesforce Partner Network](https://partnersignup.salesforce.com) on the ISV / AgentExchange track. Corporate approval is days to weeks.
2. Partner Business Org + Environment Hub + namespace (needed if you later add a 2GP; not required for a website + ECA listing draft).
3. Publishing Console → **New Listing** → app (not Action / Topic / Agent Template / MCP).
4. Link the ECA, demo org (founder/demo data only), Trust Pack URLs, screenshots.
5. Security review (questionnaire, scanner, often a fee, typically weeks). Pass before any customer-facing “on AgentExchange” claim.

### Code / ops gaps before you submit review

| Gap | Why it blocks |
|---|---|
| **PKCE** | Partner ECAs send `code_challenge` / `code_verifier` ([ISVforce](https://developer.salesforce.com/docs/platform/isvforce/guide/secure-code-ac-eca.html)). **Shipped:** `oauth-start` sets an httpOnly cookie; authorize includes S256; token exchange sends `code_verifier`. |
| **Refresh token rotation** | Refresh response can return a **new** refresh token; persist it. Current refresh path keeps `data.refresh_token ?? stored.refresh_token` — OK if Salesforce returns a new one. |
| **30-day idle TTL** | Need a refresh heartbeat (~every 25 days) or users re-auth after idle months. |
| **Refresh-token IP allowlist** | Render outbound IPs are not static on a free web service. Paid Render **static outbound IPs** (or a fixed egress) before locking this control. Max 256 addresses. Do not mix localhost and production callbacks for the allowlisted app if Salesforce warns against mixed-purpose URLs — use one production ECA + a separate local ECA. |
| **Token persist** | Dual-write Salesforce tokens to Supabase like `google_oauth_tokens` so Connect survives deploys. |
| **Trust dossier** | Data-flow diagram (LLM in/out, no silent CRM writes), privacy/DPA/security-overview URLs. SOC 2 is **not** claimed. |

PKCE is in production code. Remaining listing blockers are idle-TTL heartbeat, static egress IPs, and dual-write tokens to Supabase. Then self-attest **Review Controls** in Setup if any toggle is still unlocked.

## 6. Explicitly not this sprint

- Agentforce actions, topics, agent templates, or an MCP server (separate product surface).
- Lightning **UI API** (`/services/data/vXX.0/ui-api`).
- A 2GP managed package (none in this repo). Required later only if you want in-org install / Agentforce Builder.
- AppExchange zip uploads of the Meet/Teams widgets — wrong store.

Do not tell paying customers Lazarus is on AgentExchange until the listing status is Active.
