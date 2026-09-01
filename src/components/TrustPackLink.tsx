import type { MouseEvent, ReactNode } from "react";
import { openTrustPack, TRUST_PACK_LABELS, trustPackUrl, type TrustPackSlug } from "../lib/trustPack";

interface Props {
  slug: TrustPackSlug;
  children: ReactNode;
}

export default function TrustPackLink({ slug, children }: Props) {
  const href = trustPackUrl(slug);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    openTrustPack(slug);
  };

  return (
    <a href={href} className="trust-pack-link" aria-label={TRUST_PACK_LABELS[slug]} onClick={onClick}>
      {children}
    </a>
  );
}
