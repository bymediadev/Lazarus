import { HERO_PRIMARY_CTA } from "../lib/cta";
import { BOOKING_URL, FOUNDER_LINKEDIN, FOUNDER_NAME, WALKTHROUGH_EMBED_URL } from "../lib/site";
import { scrollToSection } from "../lib/appRoute";
import { useReveal } from "../lib/useReveal";
import { PricingPlanCards } from "./PricingGate";
import ContactSection from "./ContactSection";
import TrustPackLink from "./TrustPackLink";
import type { CheckoutPlan } from "../lib/billing";

type Props = {
  onSignup: () => void;
  onPortal: () => void;
  onCheckout: (plan: CheckoutPlan) => void;
  stripeConfigured?: boolean;
  checkoutBusy?: string | null;
  checkoutError?: string | null;
};

function BookLookButton({ className }: { className?: string }) {
  return (
    <a
      className={className ?? "btn-secondary"}
      href={BOOKING_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Book a 30-minute look
    </a>
  );
}

export default function MarketingHome({
  onSignup,
  onPortal,
  onCheckout,
  stripeConfigured = true,
  checkoutBusy = null,
  checkoutError = null,
}: Props) {
  useReveal();

  return (
    <>
      <section className="marketing-hero">
        <p className="hero-trust-eyebrow">B2B deal recovery</p>
        <h1 className="marketing-hero-title">Win back stalled sales pipeline</h1>
        <p className="marketing-hero-sub">
          We tell sales managers which stalled deals are recoverable versus a flat no, name the
          blocker, and put a 0–90 day plan on the HubSpot or Salesforce deal. We never join the
          call.
        </p>
        <div className="marketing-hero-actions">
          <button type="button" className="run-button run-button-above-fold" onClick={onPortal}>
            {HERO_PRIMARY_CTA}
          </button>
          <BookLookButton />
        </div>
        <p className="marketing-hero-note">
          No credit card. Five free analyses a month.{" "}
          <button type="button" className="marketing-text-link" onClick={() => scrollToSection("pricing")}>
            See pricing
          </button>
        </p>
      </section>

      <section className="marketing-steps marketing-reveal" id="how" aria-label="How it works">
        <h2>How it works</h2>
        <ol className="marketing-step-grid">
          <li>
            <span>1</span>
            <h3>Add the evidence</h3>
            <p>
              A recording, transcript, email thread, or CRM notes. One run, so the score sees the
              whole deal.
            </p>
          </li>
          <li>
            <span>2</span>
            <h3>Run the analysis</h3>
            <p>
              Lazarus names the blocker in plain language, and whether the deal is recoverable or a
              flat no.
            </p>
          </li>
          <li>
            <span>3</span>
            <h3>The deal updates</h3>
            <p>
              Connect HubSpot or Salesforce. Notes come in; the 0–90 day plan writes back to the
              record.
            </p>
          </li>
        </ol>
      </section>

      <section className="marketing-simple marketing-reveal" id="brief" aria-label="Example brief">
        <h2>What you get</h2>
        <p>
          A brief you can take into the forecast call. Your deals, your evidence — not a call recap.
        </p>
        <article className="marketing-brief-preview">
          <p className="marketing-brief-kicker">Recoverable</p>
          <h3>The real blocker</h3>
          <p>
            Procurement wants a security review. The champion has not scheduled it. The deal is
            still alive — it is not a flat no.
          </p>
          <h3>0–90 day plan</h3>
          <ol>
            <li>Get the champion to book the security review this week.</li>
            <li>Multi-thread to finance so procurement is not the only gate.</li>
          </ol>
          <p className="marketing-brief-foot">On the HubSpot or Salesforce deal.</p>
        </article>
      </section>

      <section className="marketing-simple marketing-product marketing-reveal" id="layout" aria-label="The workspace">
        <h2>The workspace</h2>
        <p className="marketing-product-caption">Evidence on the left. Brief on the right.</p>
        <figure className="marketing-product-frame">
          <img
            src="/landing-portal.png"
            alt="Lazarus Deal Recovery workspace: drop evidence on the left, recovery brief on the right"
            width={1600}
            height={900}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <p className="marketing-product-caption">A four-minute walkthrough</p>
        <div className="marketing-video-frame">
          <iframe
            src={WALKTHROUGH_EMBED_URL}
            title="How Lazarus Recovers Stalled Sales Deals"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>

      <section className="marketing-simple marketing-reveal" id="who" aria-label="Who it is for">
        <h2>Who it’s for</h2>
        <div className="marketing-split">
          <div>
            <h3>For</h3>
            <p>
              Sales managers and VPs who own the forecast call. Mid-market B2B. HubSpot or
              Salesforce.
            </p>
          </div>
          <div>
            <h3>Not for</h3>
            <p>
              Anyone shopping for an AI SDR, an autonomous closer, a meeting bot, or a Gong
              replacement. Keep your recorder. Lazarus sits on top and judges the deal.
            </p>
          </div>
        </div>
      </section>

      <section className="marketing-simple marketing-reveal" id="answers" aria-label="Straight answers">
        <h2>Straight answers</h2>
        <p>If we do not have it, we say so.</p>
        <dl className="marketing-qa">
          <div>
            <dt>Do you join the call?</dt>
            <dd>
              No. Lazarus never joins Meet, Teams, or Zoom. You drop the recording, transcript, or
              email after. Keep the tools you already use.
            </dd>
          </div>
          <div>
            <dt>Why not paste the transcript into ChatGPT?</dt>
            <dd>
              ChatGPT writes. Paste the same call twice and the answer can change. Lazarus checks
              quotes against the transcript, then scores with fixed rules you can defend in the
              room.
            </dd>
          </div>
          <div>
            <dt>Does the AI invent quotes or people?</dt>
            <dd>
              If a quote or person is not in your upload, the server strips it before the score
              runs — and tells you it did. You score what is left.
            </dd>
          </div>
          <div>
            <dt>Is our data safe? Do you have SOC 2?</dt>
            <dd>
              Encrypted in transit and at rest. Your content is not used to train public models.
              Teams only see their own deals. Saved transcripts purge on a 30-day default. We are
              not SOC 2 certified today — honest fit for a pilot and mid-market. Full detail:{" "}
              <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>.
            </dd>
          </div>
          <div>
            <dt>Do you read our whole inbox?</dt>
            <dd>
              No. Mailbox connect is read-only. You search a deal and attach that thread. No silent
              scrape.
            </dd>
          </div>
          <div>
            <dt>Will reps have to upload another tool?</dt>
            <dd>
              No. The manager can drop the file or attach email. This is forecast triage, not rep
              homework.
            </dd>
          </div>
        </dl>
      </section>

      <section className="marketing-page marketing-band marketing-reveal" id="pricing">
        <h2>Five free a month. Then $10 a report, or a monthly plan.</h2>
        <p className="marketing-page-lead">
          You pay per deal analysis, not per seat. Free needs no card. Paid plans go through Stripe
          — you create an account after checkout.
        </p>
        <PricingPlanCards
          configured={stripeConfigured}
          signedIn={false}
          busy={checkoutBusy}
          error={checkoutError}
          includeFree
          onSignIn={onSignup}
          onStartFree={onPortal}
          onCheckout={onCheckout}
        />
      </section>

      <section className="marketing-page marketing-reveal" id="about">
        <h2>About Lazarus Deal Recovery</h2>
        <p className="marketing-page-lead">
          Built for sales managers and VPs who run forecast calls and need a straight answer on
          stalled deals.
        </p>
        <p>
          You already have a recorder and HubSpot. What you do not have is a clear call on which
          deals are still winnable. Lazarus reads the evidence you already have and returns a brief
          you can defend in the room.
        </p>
        <p>
          A person still runs the deal. Lazarus does not sell, write outreach, or replace your team.
          Your data stays on your account — not used to train public models.{" "}
          <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>.
        </p>
        <p>
          Founded by{" "}
          <a href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer">
            {FOUNDER_NAME}
          </a>
          .
        </p>
      </section>

      <ContactSection />
    </>
  );
}
