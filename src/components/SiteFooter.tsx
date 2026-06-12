export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">Lazarus · Deterministic Deal Intelligence</span>
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
          <a href="/security-battlecard.html" target="_blank" rel="noopener noreferrer">
            Security Battlecard
          </a>
          <a href="#enterprise-trust">Security</a>
        </nav>
        <span className="site-footer-copy">
          © {new Date().getFullYear()} Lazarus. Encrypted at rest · TLS 1.3 in transit · RLS
          tenant isolation.
        </span>
      </div>
    </footer>
  );
}
