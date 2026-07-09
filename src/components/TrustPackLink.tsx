import type { ReactNode } from "react";
import { openTrustPack, TRUST_PACK_LABELS, type TrustPackSlug } from "../lib/trustPack";

interface Props {
  slug: TrustPackSlug;
  children: ReactNode;
}

export default function TrustPackLink({ slug, children }: Props) {
  return (
    <button
      type="button"
      className="trust-pack-link"
      aria-label={TRUST_PACK_LABELS[slug]}
      onClick={() => openTrustPack(slug)}
    >
      {children}
    </button>
  );
}
