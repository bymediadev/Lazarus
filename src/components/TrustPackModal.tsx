import { useEffect, useRef } from "react";
import { TRUST_PACK_LABELS, trustPackUrl, type TrustPackSlug } from "../lib/trustPack";

interface Props {
  slug: TrustPackSlug;
  onClose: () => void;
}

export default function TrustPackModal({ slug, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="trust-pack-overlay" role="presentation" onClick={onClose}>
      <div
        className="trust-pack-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={TRUST_PACK_LABELS[slug]}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="trust-pack-dialog-header">
          <span className="trust-pack-dialog-title">{TRUST_PACK_LABELS[slug]}</span>
          <div className="trust-pack-dialog-actions">
            <a
              className="trust-pack-dialog-link"
              href={trustPackUrl(slug)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in tab
            </a>
            <button type="button" className="trust-pack-dialog-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <iframe
          className="trust-pack-frame"
          title={TRUST_PACK_LABELS[slug]}
          src={trustPackUrl(slug)}
        />
      </div>
    </div>
  );
}
