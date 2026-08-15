import { CHECKOUT_PLANS, type CheckoutPlan } from "../lib/billing";

type Props = {
  signedIn: boolean;
  configured: boolean;
  pastDue?: boolean;
  message: string;
  busy: string | null;
  error?: string | null;
  onSignIn: () => void;
  onCheckout: (plan: CheckoutPlan) => void;
};

export function PricingPlanCards({
  configured,
  signedIn,
  busy,
  onSignIn,
  onCheckout,
  plans,
}: Pick<Props, "configured" | "signedIn" | "busy" | "onSignIn" | "onCheckout"> & {
  plans?: CheckoutPlan[];
}) {
  const visible = plans
    ? CHECKOUT_PLANS.filter((plan) => plans.includes(plan.id))
    : CHECKOUT_PLANS;
  return (
    <div className={`pricing-plan-grid${visible.length === 2 ? " pricing-plan-grid-2" : ""}`}>
      {visible.map((plan) => (
        <article
          key={plan.id}
          className={`pricing-plan-card${plan.recommended ? " pricing-plan-card-recommended" : ""}`}
        >
          <p className="pricing-plan-price">{plan.price}</p>
          <h3>
            {plan.title}
            {plan.recommended ? <span className="pricing-plan-badge">Recommended</span> : null}
          </h3>
          <p className="pricing-plan-detail">{plan.detail}</p>
          <button
            type="button"
            className="run-button"
            disabled={!!busy || (signedIn && !configured)}
            onClick={() => {
              if (!signedIn) {
                onSignIn();
                return;
              }
              onCheckout(plan.id);
            }}
          >
            {busy === plan.id
              ? "Redirecting…"
              : !signedIn
                ? "Sign in to buy"
                : !configured
                  ? "Billing not configured"
                  : plan.id === "ppu"
                    ? "Buy 1 report"
                    : "Subscribe"}
          </button>
        </article>
      ))}
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
  onSignIn,
  onCheckout,
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
      {!signedIn && (
        <button type="button" className="btn-secondary" onClick={onSignIn}>
          Sign in to pay
        </button>
      )}
      <PricingPlanCards
        configured={configured}
        signedIn={signedIn}
        busy={busy}
        onSignIn={onSignIn}
        onCheckout={onCheckout}
      />
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
