# Google Cloud — publish Sign in with Google (identity only)

This is **not** Gmail, Meet, or Google Workspace Marketplace. It is Lazarus product login.

Login scopes (must be the only scopes on **this** OAuth client):

- `openid`
- `email`
- `profile`

Gmail Connect uses a **second** client (`GOOGLE_CONNECT_CLIENT_ID` / `GOOGLE_CONNECT_CLIENT_SECRET`). Leave that client in Testing until Google restricted-scope verification. Do not add `gmail.readonly` to the login client’s consent screen.

## One-time split (if you currently have a single mixed-scope client)

1. In Google Cloud → Credentials, keep the **existing** Web client (the one that already has Gmail scopes) as **Connect**.
2. Create a **new** Web application OAuth client named `Lazarus login`.
3. Authorized redirect URIs on **both** clients:
   ```
   http://localhost:3001/api/integrations/google/callback
   https://lazarus-4uxi.onrender.com/api/integrations/google/callback
   ```
4. Authorized JavaScript origins (if prompted): `https://www.getldr.ca`, `https://getldr.ca`, `http://localhost:5173`.
5. On Render:
   - Move the **old** client id/secret into `GOOGLE_CONNECT_CLIENT_ID` / `GOOGLE_CONNECT_CLIENT_SECRET` (and optional `GOOGLE_CONNECT_REDIRECT_URI`).
   - Put the **new login** client into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. Redeploy. Sign in with Google uses identity scopes only. Connect Gmail still uses the old client.

Until `GOOGLE_CONNECT_*` is set, Connect falls back to `GOOGLE_*` so existing Gmail users do not break. **You cannot publish login to Production while Gmail scopes remain on that same consent screen.** Do the split first.

## Consent screen → In production

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → OAuth consent screen.
2. User type: **External**.
3. App name: Lazarus Deal Recovery.
4. User support email + developer contact: `support@getldr.ca`.
5. App logo: `public/logo.png` (or `marketplace/icons/icon-512.png` after `npm run marketplace:icons`).
6. Application home: `https://www.getldr.ca`
7. Privacy: `https://www.getldr.ca/privacy`
8. Terms: `https://www.getldr.ca/terms`
9. Authorized domains: `getldr.ca`
10. Scopes on **this** brand: `openid`, `email`, `profile` only. Remove Gmail / Calendar / Meet if they appear.
11. Publishing status: **In production** (not Testing).
12. Complete brand verification if Google asks (non-sensitive scopes; no CASA).

Do not tell paying customers to use Sign in with Google until the status is In production.

## Verify locally

1. `GET /api/auth/status` → `"google": true`
2. Click **Google** on https://www.getldr.ca/login
3. Consent should list only basic profile/email — not Gmail.
