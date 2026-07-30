import TrustPackLink from "./TrustPackLink";
import { TRUST_PACK_NAV } from "../lib/trustPack";

const TRUST_PILLARS = [
  {
    title: "Your data stays yours",
    body: "Customer content is not used to train public AI models. APIs run with zero-retention settings where available.",
  },
  {
    title: "Locked down by default",
    body: "TLS in transit. AES-256 at rest when stored. Raw audio is processed in memory — not saved to disk.",
  },
  {
    title: "Each customer walled off",
    body: "Database row-level security so teams only see their own deals. Admin keys never ship to the browser.",
  },
];

export function HeroTrustBanner() {
  return (
    <section className="hero-trust">
      <p className="hero-trust-eyebrow">Deal judgment layer · v1</p>
      <h2 className="hero-trust-headline">
        Keep your meeting tools. Add Lazarus Deal Recovery on top. Know if the deal is still winnable —
        and why.
      </h2>
      <p className="hero-trust-body">
        Lazarus Deal Recovery is not another recorder. You already meet on Google Meet, Microsoft Teams,
        or whatever your team uses. We read what the buyer said — from a file, a transcript, email, or
        field notes — and score the deal with fixed rules you can defend in a forecast meeting. A person
        still runs the deal.
      </p>
      <ul className="hero-trust-bullets">
        <li>
          <strong>The problem:</strong> Recordings pile up. ChatGPT gives advice you cannot repeat.
          Nobody knows which deals are actually dead.
        </li>
        <li>
          <strong>The solution:</strong> One place to score risk, map blockers, and stitch call +
          email + field into one story.
        </li>
        <li>
          <strong>The guardrail:</strong> Published Trust Pack, encryption, purge options, and no
          public model training on your content.
        </li>
      </ul>
      <p className="hero-trust-legal">
        {TRUST_PACK_NAV.map(({ slug, label }, i) => (
          <span key={slug}>
            {i > 0 && " · "}
            <TrustPackLink slug={slug}>{label}</TrustPackLink>
          </span>
        ))}
      </p>
    </section>
  );
}

export default function EnterpriseTrust() {
  return (
    <section className="enterprise-trust" id="enterprise-trust">
      <div className="enterprise-trust-header">
        <span className="enterprise-trust-label">Enterprise Trust &amp; Privacy</span>
        <h2>Built for legal review before your first upload</h2>
        <p>
          Lazarus Deal Recovery judges the deal on our server — not in the browser, not in a chatbot
          essay. Your sensitive data never trains public models. Full legal pack linked below.
        </p>
      </div>
      <div className="trust-grid">
        {TRUST_PILLARS.map((p) => (
          <article key={p.title} className="trust-card">
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </article>
        ))}
      </div>
      <div className="trust-meta">
        <div className="trust-meta-item">
          <span className="trust-meta-key">Data retention</span>
          <span className="trust-meta-val">
            Raw transcript text: configurable purge (30-day default). Deal scores and reports: kept
            for the life of the deal.
          </span>
        </div>
        <div className="trust-meta-item">
          <span className="trust-meta-key">Recording consent</span>
          <span className="trust-meta-val">
            Lazarus Deal Recovery does not join or record your meetings. You upload what you already have
            the right to use (
            <TrustPackLink slug="terms">Terms of Service §2</TrustPackLink>).
          </span>
        </div>
        <div className="trust-meta-item">
          <span className="trust-meta-key">Trust Pack</span>
          <span className="trust-meta-val">
            {TRUST_PACK_NAV.map(({ slug, label }, i) => (
              <span key={slug}>
                {i > 0 && " · "}
                <TrustPackLink slug={slug}>{label}</TrustPackLink>
              </span>
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
