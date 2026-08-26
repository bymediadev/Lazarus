# Stripe billing setup

Paid gate after **5 free deal analyses**. USD prices (canonical — do not invent SKUs):

| Plan | Price | Included | Packaging |
|------|-------|----------|-----------|
| Free | $0 | 5 analyses · **Gemini 2.5 Flash** | Evaluation |
| Pay-per-use | $10 one-time | 1 analysis credit (brief only) · **Gemini 2.5 Flash** | One ugly deal this week |
| Entry | **$99 / month** | 20 analyses + **deal lifecycle tracker** · **Gemini 2.5 Pro** | Default close / intro plan |
| Team | **$499 / month** | Unlimited + lifecycle · **Gemini 3.1 Pro** | Larger unlimited / multi-manager SKU |
| Enterprise | $1,500+ / month | Custom | Deferred until traction — no Stripe Price, no checkout |

**Do not add** a second intro price ($79 was discussed; live Entry is **$99**). **Do not** put Enterprise on the paywall. Team is high for a 5–20 AE team — lead sales with Entry; Team is the stretch plan, not the first close. Customer copy should not apologize for the Team price.

Paid plans buy a **better model**, not just more volume:

- Free / $10 → `gemini-2.5-flash` (`GEMINI_MODEL`)
- Entry → `gemini-2.5-pro` (`GEMINI_MODEL_ENTRY`)
- Team (and founder-exempt) → `gemini-3.1-pro-preview` (`GEMINI_MODEL_TEAM`), then Pro, then Flash

Gemini 3.1 Pro Preview has **no AI Studio free tier**. Enable Google billing or Team quality falls back to Pro/Flash. Relevance gate and product guide stay on Flash.

Feature split (do not put both extras on every paid SKU):

- **Lifecycle (My deals):** Entry and Team only. Free/$10 still save runs; the tracker UI stays locked until they subscribe.

Cards never touch Lazarus. Checkout and Customer Portal are hosted by Stripe.

## 1. Stripe Dashboard

1. Create a Stripe account (test mode first).
2. Products + Prices:
   - **Per report** — one-time **$10 USD**
   - **Entry** — recurring monthly **$99 USD**
   - **Team** — recurring monthly **$499 USD**
3. Copy each Price ID (`price_...`) into env.
4. Developers → Webhooks → Add endpoint:
   - URL: `https://<your-render-host>/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`
5. Copy the webhook signing secret (`whsec_...`).
6. Settings → Billing → Customer portal: enable payment method update, invoice history, and cancel.
7. Settings → Public details: set **Business name** to Lazarus Deal Recovery, website `https://www.getldr.ca`, Privacy policy `https://www.getldr.ca/privacy`, Terms of service `https://www.getldr.ca/terms`. Stripe does not have fields for the DPA or Security Overview; those live at `/dpa` and `/security-overview`.

## 2. Environment (Render + local `.env`)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PPU=price_...
STRIPE_PRICE_ENTRY=price_...
STRIPE_PRICE_TEAM=price_...
```

Success/cancel URLs use `FRONTEND_ORIGIN` (first origin) or `PUBLIC_API_URL`. Guest checkout success returns to `/login?mode=signup` with the Checkout `session_id` so the paid plan can attach after they create an account. Signed-in checkout still returns to the app.

Until these are set, the paywall still appears after 5 free runs, but checkout buttons show **Billing not configured**.

## 3. Local webhook testing

```
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Use the CLI `whsec_...` as `STRIPE_WEBHOOK_SECRET` while listening.

## 4. What the app stores

Table `billing_customers` (1:1 with `auth.users`): plan, status, free/PPU/entry usage, Stripe customer + subscription IDs. No card numbers.

Founder lookup shows the same snapshot for support.
