import { HERO_PRIMARY_CTA, PORTAL_ENTRY_CTA } from "../lib/cta";
import { BOOKING_URL, WALKTHROUGH_EMBED_URL } from "../lib/site";
import { scrollToSection } from "../lib/appRoute";
import { useReveal } from "../lib/useReveal";
import { PricingPlanCards } from "./PricingGate";
import TrustPackLink from "./TrustPackLink";

type Props = {
  onTrySample: () => void;
  onSignup: () => void;
  onPortal: () => void;
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

export default function MarketingHome({ onTrySample, onSignup, onPortal }: Props) {
  useReveal();

  return (
    <>
      <section className="marketing-hero">
        <p className="hero-trust-eyebrow">For sales managers and VPs</p>
        <h1 className="marketing-hero-title">Win back closed-lost sales pipeline</h1>
        <h2 className="marketing-hero-sub">
          Stop losing high-value sales. Lazarus uses AI to analyze dead B2B deals and build
          actionable recovery playbooks you can run.
        </h2>
        <div className="marketing-hero-actions">
          <button type="button" className="run-button run-button-above-fold" onClick={onPortal}>
            {HERO_PRIMARY_CTA}
          </button>
          <BookLookButton />
        </div>
        <p className="marketing-hero-note">
          Five free analyses in the workspace.{" "}
          <button type="button" className="marketing-text-link" onClick={onTrySample}>
            Try a sample
          </button>
          {" · "}
          <button type="button" className="marketing-text-link" onClick={onSignup}>
            Create an account
          </button>
          {" · "}
          <button type="button" className="marketing-text-link" onClick={() => scrollToSection("pricing")}>
            See pricing
          </button>
        </p>
      </section>

      <section className="marketing-simple marketing-reveal" id="who" aria-label="Who it is for">
        <h2>Who it’s for</h2>
        <p>
          Sales managers and VPs who own the forecast call. Mid-market B2B. HubSpot or Salesforce.
        </p>
        <p>
          <strong>Not for</strong> anyone shopping for an AI SDR, an autonomous closer, or a Gong
          replacement. Keep your recorder. Lazarus is the judgment layer on top.
        </p>
      </section>

      <section className="marketing-simple marketing-reveal" id="what" aria-label="What it is">
        <h2>What it is</h2>
        <p>
          A forecast tool for the manager running the call. Not a recorder. Not an AI salesperson.
          You keep Meet, Teams, or Zoom.
        </p>
        <ul className="marketing-plain-list">
          <li>Which rep-owned deals are actually going to close</li>
          <li>Which stalled deals are recoverable vs a flat no</li>
          <li>The blocker, and a 0–90 day plan you can paste into the CRM</li>
        </ul>
      </section>

      <section className="marketing-steps marketing-reveal" id="how" aria-label="How it works">
        <p className="hero-trust-eyebrow">How it works</p>
        <ol className="marketing-step-grid">
          <li>
            <span>1</span>
            <h2>Add evidence</h2>
            <p>
              A recording, transcript, email thread, or notes from your CRM. Compile them in one
              run for a full picture of the deal.
            </p>
          </li>
          <li>
            <span>2</span>
            <h2>Run analysis</h2>
            <p>Lazarus scores the deal and names the blocker in plain language.</p>
          </li>
          <li>
            <span>3</span>
            <h2>Use the brief</h2>
            <p>Take the recovery plan into forecast. Push a short note to HubSpot or Salesforce.</p>
          </li>
        </ol>
      </section>

      <section className="marketing-simple marketing-product marketing-reveal" id="layout" aria-label="The workspace">
        <h2>The workspace</h2>
        <p className="marketing-product-caption">
          Evidence on the left. Brief on the right. Enter here.
        </p>
        <figure className="marketing-product-frame">
          <img
            src="/landing-portal.png"
            alt="Lazarus Deal Recovery workspace: drop evidence on the left, recovery brief on the right"
            width={1600}
            height={900}
          />
        </figure>
        <p className="marketing-product-caption">Watch a 4-minute walkthrough</p>
        <div className="marketing-video-frame">
          <iframe
            src={WALKTHROUGH_EMBED_URL}
            title="How Lazarus Recovers Stalled Sales Deals"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <ul className="marketing-plain-list">
          <li>
            <strong>Left — Drop the evidence.</strong> Call recording, transcript, email thread, or
            CRM notes — together in one run.
          </li>
          <li>
            <strong>Right — Recovery brief.</strong> Closable vs a flat no, the blocker, and a 0–90
            day plan.
          </li>
        </ul>
      </section>

      <section className="marketing-simple marketing-reveal" id="objections" aria-label="Objections">
        <p className="hero-trust-eyebrow">Objections</p>
        <h2>The ones that show up on every call</h2>
        <p>
          Recorder, ChatGPT, legal, reps. Same answers we use in the room. Full legal pack is in the
          footer.
        </p>
        <dl className="marketing-qa">
          <div>
            <dt>We already have Meet, Teams, or a recorder.</dt>
            <dd>
              Keep it. That tool saves the call. Lazarus judges the deal — closable, recoverable, or
              a flat no. We sit on top, not instead.
            </dd>
          </div>
          <div>
            <dt>Why not just paste the transcript into ChatGPT?</dt>
            <dd>
              ChatGPT writes. Paste the same call twice and the answer can change. Lazarus reads the
              text, checks quotes against the transcript, then scores with fixed rules you can
              defend in the room.
            </dd>
          </div>
          <div>
            <dt>AI makes things up.</dt>
            <dd>
              If a quote or person is not in your upload, the server strips it before the score
              runs — and tells you it did. You score what is left, not a chatbot essay.
            </dd>
          </div>
          <div>
            <dt>Is our data safe? Do you have SOC 2?</dt>
            <dd>
              Encrypted in transit and at rest. Your content is not used to train public models.
              Teams only see their own deals. We are not SOC 2 certified today — honest fit for
              pilot and mid-market. Full detail:{" "}
              <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>.
            </dd>
          </div>
          <div>
            <dt>Do you read our whole inbox?</dt>
            <dd>
              No. Mailbox connect is read-only. You search a deal and attach the thread. No silent
              scrape, no secret CRM write.
            </dd>
          </div>
          <div>
            <dt>Reps won’t upload another tool.</dt>
            <dd>
              They don’t have to. The manager can drop the file or attach email. This is forecast
              triage, not rep homework.
            </dd>
          </div>
        </dl>
      </section>

      <section className="marketing-page marketing-band marketing-reveal" id="pricing">
        <p className="hero-trust-eyebrow">Pricing</p>
        <h2>Simple plans. Price per analysis — not per seat.</h2>
        <p className="marketing-page-lead">
          Start with five free runs. Sign in to save them. Pay only when you want to keep going.
          $99 uses a stronger model. $499 uses the strongest.
        </p>
        <PricingPlanCards
          configured
          signedIn={false}
          busy={null}
          includeFree
          onSignIn={onSignup}
          onStartFree={onPortal}
          onCheckout={() => onSignup()}
        />
      </section>

      <section className="marketing-page marketing-reveal" id="about">
        <p className="hero-trust-eyebrow">About</p>
        <h2>Lazarus Deal Recovery</h2>
        <p className="marketing-page-lead">
          Built for sales managers and VPs who run forecast calls and need a straight answer on
          stalled deals.
        </p>
        <p>
          You already have a recorder and a CRM. What you do not have is a clear call on which deals
          are still winnable. Lazarus reads the evidence you already have and returns a brief you
          can defend in the room.
        </p>
        <p>
          A person still runs the deal. Lazarus does not sell, write outreach, or replace your team.
          Your data stays on your account.
        </p>
        <div className="marketing-hero-actions">
          <button type="button" className="run-button" onClick={onPortal}>
            {PORTAL_ENTRY_CTA}
          </button>
          <BookLookButton />
        </div>
      </section>
    </>
  );
}
