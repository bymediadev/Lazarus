# Chrome Web Store — Lazarus Deal Recovery Widget



Extension source: [`extensions/meet-captions/`](../../extensions/meet-captions/) (production `manifest.json`, never `manifest.dev.json`).



Package: `npm run marketplace:package` → `marketplace/google/lazarus-deal-recovery-widget-meet.zip`

Upload this zip to the Chrome Web Store only. Do not upload it to Zoom or Teams.



This zip stays inside [`marketplace/allowed-scopes.json`](../allowed-scopes.json). It does **not** request Google OAuth. Sign in with Google is a separate Cloud consent screen ([oauth-production.md](./oauth-production.md)).



## Listing



Paste from [`marketplace/copy.md`](../copy.md). Tighten the short description to Meet:



**Name:** Lazarus Deal Recovery Widget  

**Summary:** Send Google Meet live captions into Lazarus Deal Recovery so managers can see recoverable vs flat no during the call.



**Category:** Productivity / Workflow & Planning  



**Privacy:** https://www.getldr.ca/privacy  

**Website:** https://www.getldr.ca



## Single-purpose justification



This extension reads on-page caption text on `meet.google.com` after the user turns **Captions** on, and posts those lines to the Lazarus API for a live Recovery Brief. It does not record audio, does not join as a bot, and does not request Google OAuth.



## Permission justifications (paste into the CWS form)



**storage**  

Saves the live-session id the user started on getldr.ca so caption lines can be posted to that session only.



**host_permissions: `https://lazarus-4uxi.onrender.com/*`**  

Service worker POSTs caption JSON to `/api/integrations/google/live-captions`. No other hosts are fetched.



**content script `https://meet.google.com/*`**  

Reads the caption DOM after the user turns Captions on. Not injected on other sites.



**content script `https://www.getldr.ca/*` and `https://getldr.ca/*`**  

Receives the session pair from the Lazarus portal the user already opened. First-party only.



Do **not** add `tabs`, `scripting`, `<all_urls>`, `identity`, or localhost in the store zip.



## You click



1. Pay the Chrome Web Store developer one-time fee if needed.

2. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → New item → upload `lazarus-deal-recovery-widget-meet.zip`.

3. Screenshots: 1280×800 with the **Live** tab selected and Meet adding the meeting (see [`marketplace/screenshots.md`](../screenshots.md)). Leave Upload and Mailbox visible — they stack into the same score from the signed-in account.

4. Submit for review.



Meet live captions do **not** require Sign in with Google. Lazarus login is a separate product account.

