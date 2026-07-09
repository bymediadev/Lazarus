export type TrustPackSlug =
  | "battlecard"
  | "security-overview"
  | "privacy"
  | "terms"
  | "dpa";

export const TRUST_PACK_NAV: { slug: TrustPackSlug; label: string }[] = [
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "terms", label: "Terms of Service" },
  { slug: "dpa", label: "Data Processing Addendum" },
  { slug: "security-overview", label: "Security Overview" },
  { slug: "battlecard", label: "Security Battlecard" },
];

export const TRUST_PACK_LABELS: Record<TrustPackSlug, string> = {
  battlecard: "Security Battlecard",
  "security-overview": "Security Overview",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  dpa: "Data Processing Addendum",
};

/** Served by API — works through Vite /api proxy and in production. */
export function trustPackUrl(slug: TrustPackSlug): string {
  return `/api/trust-pack/${slug}`;
}

export const TRUST_PACK_OPEN_EVENT = "lazarus:trust-pack-open";

export function openTrustPack(slug: TrustPackSlug): void {
  window.dispatchEvent(new CustomEvent(TRUST_PACK_OPEN_EVENT, { detail: slug }));
}
