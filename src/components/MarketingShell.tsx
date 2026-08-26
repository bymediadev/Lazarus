import type { ReactNode } from "react";
import { scrollToSection } from "../lib/appRoute";
import { PORTAL_ENTRY_CTA } from "../lib/cta";
import SiteFooter from "./SiteFooter";

type Props = {
  onHome: () => void;
  onPortal: () => void;
  onLogin: () => void;
  children: ReactNode;
};

export default function MarketingShell({
  onHome,
  onPortal,
  onLogin,
  children,
}: Props) {
  return (
    <div className="marketing-app">
      <header className="header marketing-header">
        <button type="button" className="header-brand" onClick={onHome}>
          <img src="/logo.png" alt="Lazarus Deal Recovery" className="header-logo" />
          <div className="header-brand-copy">
            <span className="header-product-name">Lazarus Deal Recovery</span>
            <span className="tag">Forecast &amp; Deal Recovery</span>
          </div>
        </button>
        <nav className="marketing-nav" aria-label="Site">
          <button type="button" onClick={() => scrollToSection("how")}>
            How it works
          </button>
          <button type="button" onClick={() => scrollToSection("objections")}>
            Objections
          </button>
          <button type="button" onClick={() => scrollToSection("pricing")}>
            Pricing
          </button>
          <button type="button" onClick={() => scrollToSection("about")}>
            About
          </button>
          <button type="button" onClick={() => scrollToSection("contact")}>
            Contact
          </button>
        </nav>
        <div className="header-right">
          <button type="button" className="btn-secondary header-auth-login" onClick={onLogin}>
            Log In
          </button>
          <button type="button" className="btn-primary header-auth-signup marketing-entry-cta" onClick={onPortal}>
            {PORTAL_ENTRY_CTA}
          </button>
        </div>
      </header>
      <main className="marketing-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
