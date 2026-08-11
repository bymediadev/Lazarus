import { useEffect, useRef, useState } from "react";
import { apiAuthHeaders } from "../lib/api";
import {
  FOUNDER_ONLY_TRUST_PACK,
  TRUST_PACK_LABELS,
  trustPackUrl,
  type TrustPackSlug,
} from "../lib/trustPack";

interface Props {
  slug: TrustPackSlug;
  onClose: () => void;
}

export default function TrustPackModal({ slug, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!FOUNDER_ONLY_TRUST_PACK.has(slug)) {
      setFrameSrc(trustPackUrl(slug));
      return;
    }

    setFrameSrc(null);
    void (async () => {
      try {
        const res = await fetch(trustPackUrl(slug), { headers: apiAuthHeaders() });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            res.status === 403
              ? "Founder account required to view the Security Battlecard."
              : text || `Failed to load (${res.status})`
          );
        }
        const html = await res.text();
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        blobUrlRef.current = url;
        setFrameSrc(url);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load document");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [slug]);

  const openInTab = async () => {
    if (!FOUNDER_ONLY_TRUST_PACK.has(slug)) {
      window.open(trustPackUrl(slug), "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const res = await fetch(trustPackUrl(slug), { headers: apiAuthHeaders() });
      if (!res.ok) throw new Error("Founder account required");
      const html = await res.text();
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setLoadError("Founder account required to open the Security Battlecard.");
    }
  };

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
            <button type="button" className="trust-pack-dialog-link" onClick={() => void openInTab()}>
              Open in tab
            </button>
            <button type="button" className="trust-pack-dialog-close" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        {loadError ? (
          <p className="trust-pack-frame" style={{ padding: "1.5rem" }}>
            {loadError}
          </p>
        ) : frameSrc ? (
          <iframe className="trust-pack-frame" title={TRUST_PACK_LABELS[slug]} src={frameSrc} />
        ) : (
          <p className="trust-pack-frame" style={{ padding: "1.5rem" }}>
            Loading…
          </p>
        )}
      </div>
    </div>
  );
}
