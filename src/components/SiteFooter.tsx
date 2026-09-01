import { openTrustPack, TRUST_PACK_NAV, trustPackUrl, type TrustPackSlug } from "../lib/trustPack";

export default function SiteFooter() {
  const handleOpen = (slug: TrustPackSlug) => {
    openTrustPack(slug);
  };

  return (
    <footer className="site-footer">
        <div className="site-footer-inner">
          <span className="site-footer-brand">
            Lazarus Deal Recovery · Trust Pack v1.12
          </span>
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
          </nav>
          <span className="site-footer-copy">
            © {new Date().getFullYear()} Lazarus Deal Recovery. TLS 1.3 in transit · AES-256 at rest
            (Supabase) · audio processed in memory · RLS on stored data.
          </span>
        </div>
      </footer>
  );
}
