const TRUST_PILLARS = [
  {
    title: "Zero Model Training",
    body: "Your data belongs to you. Lazarus uses zero-data-retention API configurations. Recordings, transcripts, and analysis outputs are never used to train public AI models.",
  },
  {
    title: "Bank-Grade Encryption",
    body: "All audio files and text transcripts are encrypted in transit via TLS 1.3. Data at rest is protected by AES-256 through Supabase infrastructure.",
  },
  {
    title: "Complete Access Control",
    body: "Strict Row-Level Security (RLS) on every database table ensures your team's pipeline metrics and customer conversations are invisible outside your organization.",
  },
];

export function HeroTrustBanner() {
  return (
    <section className="hero-trust">
      <p className="hero-trust-eyebrow">Enterprise Revenue Intelligence</p>
      <h2 className="hero-trust-headline">
        Secure deal autopsies for stalled pipeline — without compromising customer privacy.
      </h2>
      <p className="hero-trust-body">
        Lazarus uses compliance-hardened AI to analyze call recordings and transcripts. Built with
        enterprise-grade encryption and zero-model-training guarantees, it delivers actionable
        resuscitation plans to recover at-risk revenue.
      </p>
      <ul className="hero-trust-bullets">
        <li>
          <strong>The problem:</strong> Deals stall, but sharing raw recordings with generic AI
          tools creates compliance risk.
        </li>
        <li>
          <strong>The solution:</strong> An isolated diagnostic console that maps forces, People
          Map bottlenecks, and rescue scripts from actual call text.
        </li>
        <li>
          <strong>The guardrail:</strong> Encrypted storage, tenant-isolated database access, and
          strict data privacy protocols for enterprise buyers.
        </li>
      </ul>
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
          Proactively disarm InfoSec objections. Lazarus separates the UI shell from the
          deterministic scoring compiler — your sensitive data never trains public models.
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
            Raw audio processed in memory; transcript retention configurable (default 30-day purge
            policy recommended)
          </span>
        </div>
        <div className="trust-meta-item">
          <span className="trust-meta-key">Recording consent</span>
          <span className="trust-meta-val">
            Customer is responsible for legal right to upload call recordings (see Terms of Service)
          </span>
        </div>
        <div className="trust-meta-item">
          <span className="trust-meta-key">B2B compliance</span>
          <span className="trust-meta-val">
            Data Processing Addendum (DPA) available for GDPR / CCPA enterprise customers
          </span>
        </div>
      </div>
    </section>
  );
}
