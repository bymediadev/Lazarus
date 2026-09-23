import { COMPANY_LINKEDIN, SEO_PATHS } from "../lib/site";
import { openTrustPack, TRUST_PACK_NAV, trustPackUrl, type TrustPackSlug } from "../lib/trustPack";

export default function SiteFooter() {
  const handleOpen = (slug: TrustPackSlug) => {
    openTrustPack(slug);
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand-block">
          <span className="site-footer-brand">Lazarus Deal Recovery</span>
          <span className="site-footer-copy">
            © {new Date().getFullYear()} Lazarus Deal Recovery. Encrypted in transit and at rest.
            Not SOC 2 certified today.
          </span>
        </div>
        <nav className="site-footer-nav" aria-label="Learn more">
          <a href={SEO_PATHS.dealRecovery}>Deal recovery software</a>
          <a href={SEO_PATHS.stalled}>Stalled deals</a>
          <a href={SEO_PATHS.closedLost}>Closed-lost</a>
          <a href={SEO_PATHS.plan}>Recovery plan</a>
          <a href={SEO_PATHS.howTo}>How do I recover this deal?</a>
          <a href={SEO_PATHS.integrations}>HubSpot &amp; Salesforce</a>
        </nav>
        <nav className="site-footer-nav" aria-label="Legal">
          {TRUST_PACK_NAV.map(({ slug, label }) => (
            <a
              key={slug}
              href={trustPackUrl(slug)}
              className="trust-pack-link"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                  return;
                }
                event.preventDefault();
                handleOpen(slug);
              }}
            >
              {label}
            </a>
          ))}
          <a href={COMPANY_LINKEDIN} target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
