const TRUST_PILLARS = [
  {
    title: "Zero Model Training",
    body: "Your data belongs to you. Lazarus uses zero-data-retention API configurations. Transcripts sent to extraction APIs and analysis outputs are never used to train public AI models.",
  },
  {
    title: "Encryption & Minimal Retention",
    body: "All uploads are encrypted in transit via TLS 1.3. Raw audio is processed in memory and not persisted. Transcripts and analysis JSON stored in Supabase use AES-256 at rest when persistence is enabled.",
  },
  {
    title: "Tenant Isolation (RLS)",
    body: "PostgreSQL Row-Level Security is enabled on customer tables. When Supabase Auth is configured, each user sees only their own post-mortems. Service role credentials never ship to the browser.",
  },
];

export function HeroTrustBanner() {
  return (
    <section className="hero-trust">
      <p className="hero-trust-eyebrow">Deal Recovery Intelligence · v1</p>
      <h2 className="hero-trust-headline">
        Secure deal autopsies for stalled pipeline — without compromising customer privacy.
      </h2>
      <p className="hero-trust-body">
        Lazarus analyzes call recordings and transcripts you upload. A private API runs extraction and
        deterministic scoring — human-led, AI-assisted. Built for sales leaders who need the
        <em> why</em> behind a stalled deal, not another autonomous sales agent.
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
          <strong>The guardrail:</strong> TLS in transit, optional encrypted persistence, RLS tenant
          isolation, and a published Trust Pack (Privacy, Terms, DPA, Security Overview).
        </li>
      </ul>
      <p className="hero-trust-legal">
        <a href="/security-overview.html" target="_blank" rel="noopener noreferrer">Security Overview</a>
        {" · "}
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        {" · "}
        <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms</a>
        {" · "}
        <a href="/dpa.html" target="_blank" rel="noopener noreferrer">DPA</a>
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
            You must have legal right to upload call content — Lazarus does not record calls (
            <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms §2</a>)
          </span>
        </div>
        <div className="trust-meta-item">
          <span className="trust-meta-key">Trust Pack</span>
          <span className="trust-meta-val">
            <a href="/security-overview.html" target="_blank" rel="noopener noreferrer">SEC-001</a>
            {" · "}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer">PP-001</a>
            {" · "}
            <a href="/dpa.html" target="_blank" rel="noopener noreferrer">DPA-001</a>
            {" · "}
            <a href="/terms.html" target="_blank" rel="noopener noreferrer">ToS-001</a>
          </span>
        </div>
      </div>
    </section>
  );
}
