# Salesforce AgentExchange — listing draft (app)

OAuth is coded. Salesforce **does not take a Chrome/Teams-style zip** for this product. There is no managed package in the repo.

**Store:** [AgentExchange](https://www.salesforce.com/agentforce/agentexchange/) (unified AppExchange + Slack + Agentforce).  
**Listing type:** **App** — forecast judgment on stalled opportunities.  
**Not:** Agentforce agent, Action, Topic, Prompt Template, or MCP server.

Connected App / ECA setup: [`docs/salesforce-setup.md`](../../docs/salesforce-setup.md)  
Copy: [`marketplace/copy.md`](../copy.md)  
Scope lock: [`marketplace/allowed-scopes.json`](../allowed-scopes.json) — `salesforce` array only:

- `api`
- `refresh_token`
- `offline_access`

Do **not** add Full Access, Chatter, or custom Apex scopes. Lazarus searches opportunities the user picks, imports context, and optionally Pushes a note they click.

## Listing draft (paste in Publishing Console)

**Title:** Lazarus Deal Recovery  
**Tagline:** Recoverable vs flat no — forecast judgment on stalled Salesforce opportunities.

**Short description (semantic / intent — not keyword stuffing):**  
Help sales managers defend the forecast: which stalled Opportunities will close, which are recoverable versus a flat no, and what to do in the next 0–90 days. Import the opportunity the manager picks; Push a CRM note only after they confirm.

**Full description:** Use the long description in `marketplace/copy.md`. Add: Connect a Salesforce org so managers can import opportunity context and optionally Push a CRM note they reviewed. Lazarus is not bidirectional Salesforce sync and not an AI that updates your pipeline unattended.

**Clouds / categories:** Sales Cloud · Sales productivity · Revenue intelligence  

**Security / privacy:** https://www.getldr.ca/security-overview · https://www.getldr.ca/privacy · https://www.getldr.ca/dpa

**What we never claim on the listing**

- AI SDR, autonomous closer, “agent that sells for you”
- Silent CRM write-back or full pipeline sync
- “Listed on AgentExchange” before Salesforce sets the listing Active
- SOC 2 Type II (not certified)

## What you can do today

1. Create/verify the **External Client App** in your Salesforce org ([salesforce-setup.md](../../docs/salesforce-setup.md)) with **only** the three scopes above. Spring ’26: do not create a new Connected App.
2. Confirm production login: `/login` → Salesforce, and portal Connect.
3. If you already have a **Partner Community / ISV** account, start a listing draft with the copy above and demo-org notes (founder/demo account, no customer data).

## What you cannot finish today

- AgentExchange **security review** (questionnaire, scanner, often a fee, weeks)
- Partner OAuth remaining: idle TTL heartbeat, static egress IPs, Supabase token persist — see salesforce-setup.md §5. PKCE is implemented.
- A managed package (none in this repo)
- “Listed on AgentExchange” as a customer-facing claim

Do not tell paying customers the app is on AgentExchange until Salesforce says it is.  
Do not upload `lazarus-deal-recovery-widget-meet.zip` or `lazarus-deal-recovery-widget-teams.zip` to Partner Community — those are the wrong stores.
