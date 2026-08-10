# WhiteWhale setup

Pull **company buying signals** and **Why Now** narratives from [WhiteWhale](https://www.getwhitewhale.com/api) into Lazarus Deal Recovery so the **Recovery Brief** can use where the account is going, timing pressure, and recovery angles — alongside CRM history and call evidence.

WhiteWhale is **account/domain** intelligence (not contact/person enrichment). People data on their API is deprecated.

## What you get in Lazarus

1. Enter a **company domain** as Deal Profile **Account ID** (e.g. `acme.com`).
2. **Run Analysis** — when WhiteWhale is configured, the server auto-looks up buying signals for that domain.
3. Signals appear in the **report** as **Why Now / Buying Signals** (summary, score, positive signals with sources). They are also passed into Gemini as market-timing context for forecastability / recoverable-vs-flat-no judgment — not as CRM notes.
4. Soft-fail: missing config, non-domain Account ID, no WhiteWhale account, or API errors → analysis continues without the section.

Lookup / monitor HTTP routes remain available for ops tooling; the product UI no longer shows WhiteWhale on Deal Profile.

## Env vars

Add to local `.env` and Render:

```env
WHITE_WHALE_API_KEY=your_team_api_key
WHITE_WHALE_USER_EMAIL=you@company.com
# Optional:
# WHITE_WHALE_BASE_URL=https://app.getwhitewhale.com
```

| Variable | Required | Notes |
|----------|----------|--------|
| `WHITE_WHALE_API_KEY` | Yes | Shared team key from WhiteWhale **Settings → API & Webhooks** |
| `WHITE_WHALE_USER_EMAIL` | Yes | Email of a provisioned WhiteWhale user (sent as `user` header) |
| `WHITE_WHALE_BASE_URL` | No | Default `https://app.getwhitewhale.com` |

Restart the API after changing env (`npm run dev` or Render redeploy).

## API surface (Lazarus)

| Route | Purpose |
|-------|---------|
| `GET /api/integrations/whitewhale/status` | Configured + credits / ICP smoke check |
| `POST /api/integrations/whitewhale/lookup` | `{ domain }` → account intel (ops / tooling) |
| `POST /api/integrations/whitewhale/monitor` | `{ domain, activate?: false }` → upload for monitoring |
| `POST /api/post-mortem` | Auto-lookup when `account_id` is a domain; response includes `whitewhale_intel` |

Health flag: `GET /api/health` → `whitewhale: true` when both key and user email are set.

## Upstream WhiteWhale docs

- Product API page: https://www.getwhitewhale.com/api  
- Reference: https://docs.getwhitewhale.com/api  
- OpenAPI: https://app.getwhitewhale.com/api_docs  

Auth headers on every WhiteWhale request: `api-key` + `user`.

## ICP note

Use signals for **forecast / recoverable-vs-flat-no** context (budget cycles, leadership changes, M&A, hiring). Do not pitch Lazarus as an outbound SDR tool powered by WhiteWhale.
