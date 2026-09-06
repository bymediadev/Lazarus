# Screenshot and icon specs

Capture from https://www.getldr.ca (production) or local `npm run dev`. Do not include customer names, emails, or live deal data — use a demo/founder account.

Store the captures in this folder when ready (`marketplace/screenshots/` — gitignored if they contain customer data; dummy/demo shots may be committed).

## Icons (generate with `npm run marketplace:icons`)

| File | Size | Used by |
|---|---|---|
| `marketplace/icons/icon-16.png` | 16×16 | Chrome Web Store / extension |
| `marketplace/icons/icon-32.png` | 32×32 | Teams outline source |
| `marketplace/icons/icon-48.png` | 48×48 | Chrome Web Store / extension |
| `marketplace/icons/icon-128.png` | 128×128 | Chrome Web Store / extension |
| `marketplace/icons/icon-192.png` | 192×192 | Teams color icon |
| `marketplace/icons/icon-512.png` | 512×512 | HubSpot / Zoom / Salesforce |

Source art: `public/logo.png`.

## Screenshots

| Store | Size | Count | Notes |
|---|---|---|---|
| Chrome Web Store | 1280×800 or 640×400 | 1–5 | Meet + Live tab; no other products in the shot |
| Zoom Marketplace | 1280×800 (min 746×420) | 3–5 | Live RTMS / Recovery Brief; Home URL loaded |
| Teams Store | 1366×768 | 1–4 | Side panel or portal in a meeting context |
| HubSpot | 1600×900 recommended | 3+ | Deal import, not a fake CRM write-back story |
| Salesforce AppExchange | 1024×1024 listing logo + 16:9 screens | listing form | Connected App demo org, not a security-review substitute |
| Google Workspace Marketplace | 1280×800 | later | Scaffold only this sprint |

## What not to show

- SOC 2 Type II (not certified)
- “Approved on [store]” before the store says so
- Gmail access as part of Sign in with Google
- Auto-pull of Teams Graph transcripts (not shipped)
