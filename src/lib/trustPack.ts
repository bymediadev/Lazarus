export type TrustPackSlug =
  | "battlecard"
  | "security-overview"
  | "privacy"
  | "terms"
  | "dpa";

/** Public customer-facing Trust Pack (footer, enterprise trust, consent links). */
export const TRUST_PACK_NAV: { slug: TrustPackSlug; label: string }[] = [
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "terms", label: "Terms of Service" },
  { slug: "dpa", label: "Data Processing Addendum" },
  { slug: "security-overview", label: "Security Overview" },
];

/** Founder-owned sales enablement — gated to joshua.bennett003@gmail.com on the API. */
export const FOUNDER_TRUST_PACK_NAV: { slug: TrustPackSlug; label: string }[] = [
  { slug: "battlecard", label: "Security Battlecard" },
];

export const TRUST_PACK_LABELS: Record<TrustPackSlug, string> = {
  battlecard: "Security Battlecard",
  "security-overview": "Security Overview",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  dpa: "Data Processing Addendum",
};

export const FOUNDER_ONLY_TRUST_PACK = new Set<TrustPackSlug>(["battlecard"]);

/** Public docs at /privacy, /terms, /dpa, /security-overview. Battlecard stays API-gated. */
export function trustPackUrl(slug: TrustPackSlug): string {
  if (FOUNDER_ONLY_TRUST_PACK.has(slug)) return `/api/trust-pack/${slug}`;
  return `/${slug}`;
}

export const TRUST_PACK_OPEN_EVENT = "lazarus:trust-pack-open";

export function openTrustPack(slug: TrustPackSlug): void {
  window.dispatchEvent(new CustomEvent(TRUST_PACK_OPEN_EVENT, { detail: slug }));
}
