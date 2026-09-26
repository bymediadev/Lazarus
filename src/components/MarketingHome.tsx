import { COMPANY_LINKEDIN, FOUNDER_NAME, WALKTHROUGH_EMBED_URL } from "../lib/site";
import { scrollToSection } from "../lib/appRoute";
import { useReveal } from "../lib/useReveal";
import { PricingPlanCards } from "./PricingGate";
import ContactSection from "./ContactSection";
import HeroFold from "./HeroFold";
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

      <StakeholderSelector />

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

      <FrictionPoints />

      <section className="marketing-simple marketing-reveal" id="brief" aria-label="What the report returns">
        <h2>What the report gives you</h2>
        <p>
          Lazarus does not give every stalled deal the same 90-day playbook. It gives you the next
          action, the next checkpoint, and a longer path only when the evidence needs one. If the
          deal is a flat no, the plan is to stop.
        </p>
        <ol className="marketing-report-walk">
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

      <RevenueChain />

      <CrmComparison />

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
              ChatGPT writes. Paste the same call twice and the answer can change. A general AI
              generates an answer. Lazarus checks quotes against the transcript, then scores with
              fixed rules you can defend in the room.
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
              No. A manager can drop the file for the team. A rep can also run the one deal they are
              trying to save. Either way, it is not a new daily tool.
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
    </>
  );
}
