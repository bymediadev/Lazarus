import { FOUNDER_NAME } from "../lib/site";
import { HERO_PRIMARY_CTA, HERO_PRIMARY_CTA_NOTE } from "../lib/cta";
import { useReveal } from "../lib/useReveal";
import { PricingPlanCards } from "./PricingGate";
import ContactSection from "./ContactSection";
import HeroFold from "./HeroFold";
import HeroSampleBrief from "./HeroSampleBrief";
import PipelineCalculator from "./PipelineCalculator";
import StallWalkthrough from "./StallWalkthrough";
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

      <StallWalkthrough />

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

      <section className="marketing-simple marketing-reveal" id="layout" aria-label="Purpose-built method">
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

      <section className="marketing-simple marketing-product marketing-reveal" id="workspace" aria-label="The workspace">
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

      <RevenueChain />

      <FrictionPoints />

      <CrmComparison />

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
          Your data stays on your account — not used to train public models.
        </p>
        <p>Founded by {FOUNDER_NAME}.</p>
      </section>

      <ContactSection />

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
            <summary>What model reads the deal?</summary>
            <div className="marketing-qa-panel">
              <p>
                Google Gemini reads the transcript and maps it to the Force Interaction Framework.
                It does not write the score.
              </p>
              <p>
                The five free runs use Gemini 2.5 Flash. If Gemini is unavailable, that run can go
                to OpenRouter on a free model, with training turned off.
              </p>
              <p>Entry uses Gemini 2.5 Pro. Team uses Gemini 3.1 Pro.</p>
              <p>
                Recoverable or a flat no, the risk score, and the next steps come from fixed rules
                on our server.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>What sales framework breaks the deal down?</summary>
            <div className="marketing-qa-panel">
              <p>
                The Force Interaction Framework. Gemini only maps words that were actually spoken.
              </p>
              <p>
                Each quote is one force: an enabler that moves the deal, a constraint that stalls
                it, intent, timing, or behavior. The people map names the champion, a hidden
                detractor, and a decision maker who was not on the call.
              </p>
              <p>
                The server scores those forces. That score is recoverable or a flat no, the risk
                score, and the next steps.
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
            <summary>Do you save the call?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. The transcript and the quotes are used to write the report, then not saved.
                Audio is processed in memory and is not written to disk. A guest run is not saved to
                an account.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>How long do you keep the report?</summary>
            <div className="marketing-qa-panel">
              <p>
                While the deal is still open, the report stays. That is the score, the status, and
                the next actions. When HubSpot or Salesforce marks the deal complete, the report is
                deleted then. If the CRM is not connected, the report is deleted 30 days after the
                deal is marked won, or a flat no. A deal that is still stalled, or still recoverable,
                is not on that clock.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Who can see our deals?</summary>
            <div className="marketing-qa-panel">
              <p>
                Each company only sees its own reports. Another customer’s workspace cannot read
                them.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>What does a company key do?</summary>
            <div className="marketing-qa-panel">
              <p>
                A signed-in company can create a key for its own server. The key is shown once. We
                store a hash, not the key. Their server sends the deal in. The transcript stays on
                their side. Lazarus returns the report.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you train models on our calls?</summary>
            <div className="marketing-qa-panel">
              <p>No. Your content is not used to train public models.</p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Who owns our data?</summary>
            <div className="marketing-qa-panel">
              <p>
                You do. You keep ownership of the recording, the transcript, and the notes you upload.
                Lazarus has a limited right to process that content only to write the report. You are
                the controller. We are the processor. The report is yours to use inside the business.
                That is in the <TrustPackLink slug="terms">Terms of Service</TrustPackLink> and the{" "}
                <TrustPackLink slug="dpa">Data Processing Addendum</TrustPackLink>.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>What do you do with the call?</summary>
            <div className="marketing-qa-panel">
              <p>
                We read it to say whether the deal is recoverable or a flat no, what is blocking it,
                and what to do next. Then the transcript and the quotes are not saved. We do not sell
                the content, use it for ads, or train public models on it.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Where does the data go?</summary>
            <div className="marketing-qa-panel">
              <p>
                North America, by default. If you are signed in, the report is stored with Supabase.
                The transcript is sent to Google Gemini to extract the brief. A free run can use
                OpenRouter if Gemini is unavailable. We do not save the transcript.
                If you upload audio, AssemblyAI transcribes it, and we do not save the audio. Stripe
                sees billing only if you pay. Gmail, Outlook, Zoom, Teams, HubSpot, and Salesforce
                run only when you connect them. The full list is in the{" "}
                <TrustPackLink slug="dpa">Data Processing Addendum</TrustPackLink>.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Can your team read our deals?</summary>
            <div className="marketing-qa-panel">
              <p>
                The transcript is not kept, so there is no call library to open later. Other companies
                cannot see your reports. The service that writes the report runs on our server. An
                allowlisted ops login can reach operational tools. We do not use your deals to train
                models, and we do not sell them.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>How do we delete our data?</summary>
            <div className="marketing-qa-panel">
              <p>
                Delete the account from Account, or email support@getldr.ca. A written request is
                handled within 30 days where we can technically delete it. When a contract ends,
                customer personal data is deleted from production within 30 days. The transcript was
                not saved. The report also deletes on its own 30 days after a win or a flat no.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you have SSO, a HIPAA agreement, or on-prem hosting?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Not today. Hosting is North America by default. A different region is only by
                written agreement. We do not have SSO, a HIPAA business associate agreement, or an
                on-prem install.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you offer an uptime guarantee?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. The service is provided as available. We do not offer an uptime SLA today. That
                is in the <TrustPackLink slug="terms">Terms of Service</TrustPackLink>.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Are you SOC 2 certified?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Not today. That is an honest fit for a pilot and for mid-market. Before a larger
                contract, read the{" "}
                <TrustPackLink slug="security-overview">Security Overview</TrustPackLink>, the{" "}
                <TrustPackLink slug="privacy">Privacy Policy</TrustPackLink>, and the{" "}
                <TrustPackLink slug="dpa">Data Processing Addendum</TrustPackLink>.
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
          <details className="marketing-qa-item">
            <summary>Do you replace our recorder or our CRM?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Keep the recorder and the CRM. Lazarus reads what you already have and says
                whether the deal is recoverable, what is blocking it, and what to do next.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you email buyers or close the deal for us?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. Lazarus does not write outreach, email buyers, or close the deal. A person still
                runs it.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do you promise the deal will close?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. The brief is something you can defend in the forecast. You still decide. We do
                not promise a deal will close.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Who is responsible for recording consent?</summary>
            <div className="marketing-qa-panel">
              <p>
                You are. Upload only calls and emails you already have the right to use. We do not
                join the meeting, and we do not check consent for you.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Will this write over HubSpot or Salesforce?</summary>
            <div className="marketing-qa-panel">
              <p>
                No, not on its own. HubSpot and Salesforce stay read-only until someone pushes the
                plan.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Do we pay per person?</summary>
            <div className="marketing-qa-panel">
              <p>
                No. You pay per deal analysis. Five a month are free, then $10 a report. Entry is $99
                a month for 20. Team is $499 a month for unlimited. Not per seat.
              </p>
            </div>
          </details>
          <details className="marketing-qa-item">
            <summary>Can we try one deal before we buy?</summary>
            <div className="marketing-qa-panel">
              <p>
                Yes. Five analyses a month are free. No credit card. Paste one transcript. Sign in
                only if you want the report saved.
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
    </>
  );
}
