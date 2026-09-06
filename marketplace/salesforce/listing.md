# Salesforce AppExchange — listing draft

OAuth is coded. Salesforce **does not take a Chrome/Teams-style zip** for this product. There is no managed package in the repo. AppExchange listing is a Connected App (API integration) plus **security review**.

Copy: [`marketplace/copy.md`](../copy.md)
Connected App: [`docs/salesforce-setup.md`](../../docs/salesforce-setup.md)
Scope lock: [`marketplace/allowed-scopes.json`](../allowed-scopes.json) — `salesforce` array only:

- `api`
- `refresh_token`
- `offline_access`

Do **not** add Full Access, Chatter, or custom Apex scopes. Lazarus searches opportunities the user picks, imports context, and optionally Pushes a note they click.

## Listing draft (paste when the Partner account exists)

**Title:** Lazarus Deal Recovery
**Tagline:** Recoverable vs flat no — forecast judgment on stalled Salesforce opportunities.

**Full description:** Use the long description in `marketplace/copy.md`. Add: Connect a Salesforce org so managers can import opportunity context and optionally Push a CRM note they reviewed. Lazarus is not bidirectional Salesforce sync and not an AI that updates your pipeline unattended.

**Security / privacy:** https://www.getldr.ca/security-overview · https://www.getldr.ca/privacy · https://www.getldr.ca/dpa

## What you can do today

1. Create/verify the Connected App in your Salesforce org ([salesforce-setup.md](../../docs/salesforce-setup.md)) with **only** the three scopes above.
2. Confirm production login: `/login` → Salesforce, and portal Connect.
3. If you already have a **Partner Community / ISV** account, start a listing draft with the copy above and demo-org notes (founder/demo account, no customer data).

## What you cannot finish today

- AppExchange **security review** (questionnaire, scanner, often a fee, weeks)
- A managed package (none in this repo)
- “Listed on AppExchange” as a customer-facing claim

Do not tell paying customers the app is on the AppExchange until Salesforce says it is.
Do not upload `lazarus-deal-recovery-widget-meet.zip` or `lazarus-deal-recovery-widget-teams.zip` to Partner Community — those are the wrong stores.
