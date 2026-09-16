# Google Cloud — publish Sign in with Google (identity only)

This is **not** Gmail, Meet, or Google Workspace Marketplace. It is Lazarus product login.

Login scopes (must be the only scopes on **this** OAuth client):

- `openid`
- `email`
- `profile`

Gmail Connect uses a **second Cloud project** (`GOOGLE_CONNECT_*`). A second OAuth client in the same project is not enough — Google still shows the unverified / sensitive-info screen for every client in that project.

## New Cloud project for Sign in with Google

Do not reuse the project that ever had Gmail, Calendar, or Meet scopes.

1. [Google Cloud Console](https://console.cloud.google.com/) → project picker → **New project**. Name: `Lazarus Login`.
2. **Google Auth Platform** (OAuth consent screen):
   - User type: **External**
   - App name: **Lazarus Deal Recovery**
   - Support email: the `supportgetldr` Google Group
   - Home / privacy / terms on `https://www.getldr.ca`
   - Authorized domain: `getldr.ca`
   - **No app logo** (a logo forces brand verification)
   - Data Access: `openid`, `userinfo.email`, `userinfo.profile` only
   - Publishing: **In production**
3. Create a **Web application** client. Redirect URIs:
   ```
   http://localhost:3001/api/integrations/google/callback
   https://api.getldr.ca/api/integrations/google/callback
   ```
   Origins: `https://www.getldr.ca`, `https://getldr.ca`, `http://localhost:5173`.
4. On Render, **Connect first**, then swap login (or the new project inherits Gmail):
   - Set `GOOGLE_CONNECT_CLIENT_ID` / `GOOGLE_CONNECT_CLIENT_SECRET` to the **current** `GOOGLE_*` values.
   - Set `GOOGLE_CONNECT_REDIRECT_URI=https://api.getldr.ca/api/integrations/google/callback`.
   - Replace `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` with the **new** login client.
   - Keep `GOOGLE_REDIRECT_URI=https://api.getldr.ca/api/integrations/google/callback`.
5. Deploy. Sign in uses the new project. Connect Gmail stays on the old client.

Until `GOOGLE_CONNECT_*` is set, Connect falls back to `GOOGLE_*`.

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
