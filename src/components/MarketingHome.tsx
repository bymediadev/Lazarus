import { COMPANY_LINKEDIN, FOUNDER_NAME } from "../lib/site";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";
import { useReveal } from "../lib/useReveal";
import { PricingPlanCards } from "./PricingGate";
import ContactSection from "./ContactSection";
import HeroFold from "./HeroFold";
import HeroSampleBrief from "./HeroSampleBrief";
import PipelineCalculator from "./PipelineCalculator";
import StalledDealSeries from "./StalledDealSeries";
import { CrmComparison, FrictionPoints, RevenueChain } from "./MarketingOutcomes";
import StakeholderSelector from "./StakeholderSelector";
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
      <HeroFold onScan={onPortal} />

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
              Connect HubSpot or Salesforce. Notes come in; the next action and the plan write back
              to the record.
            </p>
          </li>
        </ol>
      </section>

      <section className="marketing-simple marketing-reveal" id="brief" aria-label="What the report returns">
        <h2>What the report gives you</h2>
        <p>
          Lazarus does not give every stalled deal the same 90-day playbook. It gives you the next
          action, the next checkpoint, and a longer path only when the evidence needs one. If the
          deal is a flat no, the plan is to stop.
        </p>
        <HeroSampleBrief onScan={onPortal} assemble prominent />
        <ol className="marketing-report-walk marketing-report-walk-secondary">
          <li>
            <h3>Forecast snapshot</h3>
            <p>Five scores sit at the top. Use them when someone asks why the number moved.</p>
            <ul>
              <li>
                <strong>Deal Risk Score</strong> — how likely this deal stalls or drops.
              </li>
              <li>
                <strong>Dept friction</strong> — pushback from Legal, Security, IT, or peers.
              </li>
              <li>
                <strong>Dispersion</strong> — how fragmented the buying group is.
              </li>
              <li>
                <strong>Stall signals</strong> — missed cadence and objections still open.
              </li>
              <li>
                <strong>Recoverability</strong> — still worth manager effort, or a flat no.
              </li>
            </ul>
          </li>
          <li>
            <h3>Fast Facts</h3>
            <p>This is the default view. Three cards, then the button that updates the CRM.</p>
            <ul>
              <li>
                <strong>What this deal is</strong> — status, recoverable versus a flat no, and the
                core blocker in plain language.
              </li>
              <li>
                <strong>Main detractors</strong> — who can veto it, with the quote from your
                evidence.
              </li>
              <li>
                <strong>How to save it</strong> — the next actions. Open Concise when the evidence
                needs a longer path.
              </li>
            </ul>
          </li>
          <li>
            <h3>The recovery plan</h3>
            <p>
              Open Concise. Assign what is there. Copy for CRM, or Push to HubSpot or Salesforce.
              Empty later steps stay off the note.
            </p>
            <ul>
              <li>
                <strong>This week (0–7 days)</strong> — the next action.
              </li>
              <li>
                <strong>Inside 30 days</strong> — the checkpoint while that blocker is still live.
              </li>
              <li>
                <strong>30–90 days</strong> — only if procurement, legal, or security still has to
                move. That is the maximum horizon, not a wait.
              </li>
              <li>
                <strong>Flat no</strong> — stop. Do not spend another quarter on it.
              </li>
            </ul>
          </li>
        </ol>
        <p>Here is the shape of one recoverable deal.</p>
        <article className="marketing-brief-preview">
          <p className="marketing-brief-kicker">Recoverable</p>
          <h3>The real blocker</h3>
          <p>
            Procurement wants a security review. The champion has not scheduled it. The deal is
            still alive — it is not a flat no.
          </p>
          <h3>The plan for this deal</h3>
          <ol>
            <li>This week (0–7 days): get the champion to book the security review.</li>
            <li>Inside 30 days: send the one-pager they can forward internally.</li>
            <li>
              30–90 days: only if the review is still open. That is the longest horizon, not a wait.
            </li>
          </ol>
          <p>
            A flat no is shorter: stop, and do not spend another quarter on it.
          </p>
          <p className="marketing-brief-foot">
            Copy for CRM, or Push to HubSpot or Salesforce. That note is the plan.
          </p>
        </article>
      </section>

      <StalledDealSeries onScan={onPortal} />

      <section className="marketing-simple marketing-product marketing-reveal" id="layout" aria-label="The workspace">
        <h2>The workspace</h2>
        <p className="marketing-product-caption">Evidence on the left. Brief on the right.</p>
        <figure className="marketing-product-frame">
          <img
            src="/landing-portal.png"
            alt="Lazarus Deal Recovery workspace: drop evidence on the left, recovery brief on the right"
            width={1604}
            height={1040}
            loading="lazy"
            decoding="async"
          />
        </figure>
      </section>

      <section className="marketing-simple marketing-reveal" id="method" aria-label="Purpose-built method">
        <h2>Why not paste the transcript into ChatGPT?</h2>
        <p>
          ChatGPT writes. Paste the same call twice and the answer can change. A general AI
          generates an answer. Lazarus checks quotes against the transcript, then scores with fixed
          rules you can defend in the room.
        </p>
        <ol className="marketing-step-grid">
          <li>
            <span>1</span>
            <h3>Evidence</h3>
            <p>Lazarus checks quotes against the transcript.</p>
          </li>
          <li>
            <span>2</span>
            <h3>Score</h3>
            <p>Then scores with fixed rules.</p>
          </li>
          <li>
            <span>3</span>
            <h3>Plan</h3>
            <p>You can defend it in the room.</p>
          </li>
        </ol>
      </section>

      <section className="marketing-page marketing-reveal" id="start" aria-label="Start with one transcript">
        <h2>Start with one transcript</h2>
        <p className="marketing-page-lead">
          You can run one deal without connecting HubSpot or Salesforce. Just paste text.
        </p>
        <button type="button" className="run-button marketing-inline-cta" onClick={onPortal}>
          {HERO_PRIMARY_CTA}
        </button>
        <p>{HERO_PRIMARY_CTA_NOTE}</p>
      </section>

      <RevenueChain />

      <FrictionPoints />

      <CrmComparison />

      <StakeholderSelector />

      <section className="marketing-simple marketing-reveal" id="answers" aria-label="Straight answers">
        <h2>Straight answers</h2>
        <p>If we do not have it, we say so.</p>
        <div className="marketing-qa">
          <details className="marketing-qa-item" open>
            <summary>Do you join the call?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Lazarus never joins Meet, Teams, or Zoom. You drop the recording, transcript, or
                email after. Keep the tools you already use.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Why not paste the transcript into ChatGPT?</summary>
            <div className="marketing-qa-panel">
              <p>
                ChatGPT writes. Paste the same call twice and the answer can change. A general AI
                generates an answer. Lazarus checks quotes against the transcript, then scores with
                fixed rules you can defend in the room.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Does the AI invent quotes or people?</summary>
            <div className="marketing-qa-panel">
              <p>
                If a quote or person is not in your upload, the server strips it before the score
                runs — and tells you it did. You score what is left.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Is our data safe? Do you have SOC 2?</summary>
            <div className="marketing-qa-panel">
              <p>
                Encrypted in transit and at rest. Your content is not used to train public models.
                Teams only see their own deals. Saved transcripts purge on a 30-day default. We are
                not SOC 2 certified today — honest fit for a pilot and mid-market. Full detail:{" "}
                <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you read our whole inbox?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Mailbox connect is read-only. You search a deal and attach that thread. No silent
                scrape.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Will reps have to upload another tool?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. A manager can drop the file for the team. A rep can also run the one deal they are
                trying to save. Either way, it is not a new daily tool.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section className="marketing-page marketing-reveal" aria-label="Test a stalled deal after the answers">
        <button type="button" className="run-button marketing-inline-cta" onClick={onPortal}>
          {HERO_PRIMARY_CTA}
        </button>
        <p>{HERO_PRIMARY_CTA_NOTE}</p>
      </section>

      <section className="marketing-reveal px-5 py-10 sm:px-8 lg:px-10" id="calculator" aria-label="Pipeline calculator">
        <PipelineCalculator onScan={onPortal} />
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
          Purpose-built for one job: recovering stalled deals. Sales leaders use it across the team.
          A rep can run the deal they are personally trying to save.
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
          Founded by {FOUNDER_NAME}.{" "}
          <a href={COMPANY_LINKEDIN} target="_blank" rel="noopener noreferrer">
            Lazarus Deal Recovery on LinkedIn
          </a>
          .
        </p>
      </section>

      <ContactSection />

      <section className="marketing-page marketing-reveal" id="test" aria-label="Test a stalled deal">
        <h2>Test a stalled deal</h2>
        <p className="marketing-page-lead">
          You can run one deal without connecting HubSpot or Salesforce. Just paste text.
        </p>
        <button type="button" className="run-button marketing-inline-cta" onClick={onPortal}>
          {HERO_PRIMARY_CTA}
        </button>
        <p>{HERO_PRIMARY_CTA_NOTE}</p>
      </section>
    </>
  );
}
