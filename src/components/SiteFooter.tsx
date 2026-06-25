export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">Lazarus · Deal Recovery Intelligence · Trust Pack v1.1</span>
        <nav className="site-footer-nav" aria-label="Legal">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          <a href="/dpa.html" target="_blank" rel="noopener noreferrer">
            Data Processing Addendum
          </a>
          <a href="/security-overview.html" target="_blank" rel="noopener noreferrer">
            Security Overview
          </a>
          <a href="/security-battlecard.html" target="_blank" rel="noopener noreferrer">
            Security Battlecard
          </a>
        </nav>
        <span className="site-footer-copy">
          © {new Date().getFullYear()} Lazarus. TLS 1.3 in transit · AES-256 at rest (Supabase) ·
          audio processed in memory · RLS on stored data.
        </span>
      </div>
    </footer>
  );
}
