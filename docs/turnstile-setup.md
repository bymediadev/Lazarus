# Cloudflare Turnstile (analysis captcha)

Every `POST /api/post-mortem` in production must include a verified Turnstile token. The widget sits above the run button; the API checks the token with Cloudflare before transcription or Gemini runs.

## Create the widget

1. Open [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Add a widget (managed / checkbox).
3. Hostnames: `www.getldr.ca`, `getldr.ca`, `localhost`.
4. Copy the **site key** (public) and **secret key** (server only).

## Render (API)

| Env | Value |
|-----|--------|
| `TURNSTILE_SITE_KEY` | Site key |
| `TURNSTILE_SECRET_KEY` | Secret key |
| `CAPTCHA_REQUIRED` | Defaults **on** in production. Set `false` only for an emergency bypass. |

Restart the web service after saving.

## GitHub Pages (optional)

The UI loads the site key from `GET /api/runtime`. You do not need a Pages rebuild.

To show the widget while the API is cold, add GitHub Actions secret `VITE_TURNSTILE_SITE_KEY` (same site key) so it is baked into the static build.

## Local

Leave the keys unset — captcha is skipped so `npm run dev` still runs analyses.

To exercise the widget locally, put Cloudflare’s [dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) in `.env`:

```
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Always-pass dummy keys are for local testing only. Never use them on Render.
