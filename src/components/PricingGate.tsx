import {
  CHECKOUT_PLANS,
  PRICING_CARDS,
  PRICING_USAGE_FOOTNOTE,
  checkoutUrlFor,
  type CheckoutContext,
  type CheckoutPlan,
  type PricingCard,
} from "../lib/billing";

type Props = {
  signedIn: boolean;
  configured: boolean;
  pastDue?: boolean;
  message: string;
  busy: string | null;
  error?: string | null;
  onSignIn: () => void;
  onCheckout: (plan: CheckoutPlan) => void;
  checkoutContext?: CheckoutContext;
};

function checkoutCta(card: PricingCard, _signedIn: boolean, configured: boolean, busy: string | null) {
  if (busy === card.id) return "Redirecting…";
  if (card.id === "free") return "Start with 5 free";
  if (!configured) return "Billing not configured";
  if (card.checkout === "ppu") return "Buy 1 report";
  return "Subscribe";
}

export function PricingPlanCards({
  configured,
  signedIn,
  busy,
  onSignIn: _onSignIn,
  onCheckout,
  error,
  checkoutContext,
  plans,
  includeFree = false,
  onStartFree,
}: Pick<
  Props,
  "configured" | "signedIn" | "busy" | "error" | "onSignIn" | "onCheckout" | "checkoutContext"
> & {
  plans?: CheckoutPlan[];
  includeFree?: boolean;
  onStartFree?: () => void;
}) {
  const visible = includeFree
    ? PRICING_CARDS
    : CHECKOUT_PLANS.filter((plan) => (plans ? plans.includes(plan.checkout) : true));
  const gridClass =
    visible.length === 4
      ? " pricing-plan-grid-4"
      : visible.length === 2
        ? " pricing-plan-grid-2"
        : "";

  return (
    <div className="pricing-plan-block">
      <div className={`pricing-plan-grid${gridClass}`}>
        {visible.map((plan) => {
          const checkoutId = plan.checkout;
          const href = checkoutId ? checkoutUrlFor(checkoutId, checkoutContext) : null;
          const canPay = configured || !!href;
          const label = checkoutCta(plan, signedIn, canPay, busy);
          return (
            <article
              key={plan.id}
              className={`pricing-plan-card${plan.recommended ? " pricing-plan-card-recommended" : ""}`}
            >
              <p className="pricing-plan-price">{plan.price}</p>
              <h3>
                {plan.title}
                {plan.recommended ? <span className="pricing-plan-badge">Recommended</span> : null}
              </h3>
              <p className="pricing-plan-usage">{plan.usage}</p>
              {plan.unitCost ? <p className="pricing-plan-unit">{plan.unitCost}</p> : null}
              <p className="pricing-plan-quality">
                <span>{plan.quality}</span>
                {plan.qualityDetail}
              </p>
              <p className="pricing-plan-detail">{plan.detail}</p>
              <ul className="pricing-plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {plan.id === "free" || !href ? (
                <button
                  type="button"
                  className="run-button"
                  disabled={!!busy || (!canPay && plan.id !== "free")}
                  onClick={() => {
                    if (plan.id === "free") {
                      onStartFree?.();
                      return;
                    }
                    if (checkoutId) onCheckout(checkoutId);
                  }}
                >
                  {label}
                </button>
              ) : (
                <a className="run-button" href={href}>
                  {label}
                </a>
              )}
            </article>
          );
        })}
      </div>
      <p className="pricing-plan-footnote">{PRICING_USAGE_FOOTNOTE}</p>
      {error ? <div className="error-banner">{error}</div> : null}
    </div>
  );
}

export default function PricingGate({
  signedIn,
  configured,
  pastDue,
  message,
  busy,
  error,
  onSignIn: _onSignIn,
  onCheckout,
  checkoutContext,
}: Props) {
  return (
    <div className="pricing-gate" role="region" aria-label="Paid plans">
      {pastDue ? (
        <div className="warning-banner">
          <p>Your subscription payment is past due. Update billing on your account to continue.</p>
        </div>
      ) : (
        <div className="error-banner guest-usage-lock">
          <p>{message}</p>
        </div>
      )}
      <p className="pricing-plan-footnote">
        Paid plans open Stripe Checkout. Create or sign in to your Lazarus account after payment to
        unlock analyses.
      </p>
      <PricingPlanCards
        configured={configured}
        signedIn={signedIn}
        busy={busy}
        error={error}
        checkoutContext={checkoutContext}
        onSignIn={_onSignIn}
        onCheckout={onCheckout}
      />
    </div>
  );
}
