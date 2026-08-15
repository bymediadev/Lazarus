# Stripe billing setup

Paid gate after **5 free deal analyses**. USD prices (canonical — do not invent SKUs):

| Plan | Price | Included | Packaging |
|------|-------|----------|-----------|
| Free | $0 | 5 analyses (keep this offer) | Evaluation |
| Pay-per-use | $10 one-time | 1 analysis credit (brief only) | One ugly deal this week |
| Entry | **$99 / month** | 20 analyses + **deal lifecycle tracker** | Default close / intro plan |
| Team | **$499 / month** | Unlimited + lifecycle + **WhiteWhale Why Now** | Larger unlimited / multi-manager SKU |
| Enterprise | $1,500+ / month | Custom | Deferred until traction — no Stripe Price, no checkout |

**Do not add** a second intro price ($79 was discussed; live Entry is **$99**). **Do not** put Enterprise on the paywall. Team is high for a 5–20 AE team — lead sales with Entry; Team is the stretch plan, not the first close. Customer copy should not apologize for the Team price.

Feature split (do not put both extras on every paid SKU):

- **Lifecycle (My deals):** Entry and Team only. Free/$10 still save runs; the tracker UI stays locked until they subscribe.
- **WhiteWhale:** Team only. Lookup is skipped on free / $10 / Entry so it does not burn WhiteWhale credits.

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

## 2. Environment (Render + local `.env`)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PPU=price_...
STRIPE_PRICE_ENTRY=price_...
STRIPE_PRICE_TEAM=price_...
```

Success/cancel URLs use `FRONTEND_ORIGIN` (first origin) or `PUBLIC_API_URL`.

Until these are set, the paywall still appears after 5 free runs, but checkout buttons show **Billing not configured**.

## 3. Local webhook testing

```
stripe listen --forward-to localhost:3001/api/billing/webhook
```

Use the CLI `whsec_...` as `STRIPE_WEBHOOK_SECRET` while listening.

## 4. What the app stores

Table `billing_customers` (1:1 with `auth.users`): plan, status, free/PPU/entry usage, Stripe customer + subscription IDs. No card numbers.

Founder lookup shows the same snapshot for support.
