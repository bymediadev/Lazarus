export const BOOKING_URL = "https://calendly.com/getldr-sales/30min";

/** Hosted Stripe Payment Links — pricing CTAs skip the Render API. */
export const STRIPE_PAYMENT_LINKS = {
  ppu: "https://buy.stripe.com/28EcN7bns3Ph6m4c9x4Ja00",
  entry: "https://buy.stripe.com/fZu9AVgHMbhJ25OflJ4Ja01",
  team: "https://buy.stripe.com/4gM14p1MSgC3bGo6Pd4Ja02",
} as const;

export type StalledDealVerdict = "recoverable" | "flat-no";

/** Newest week first. Add a line; the homepage section picks it up. */
export type StalledDealEpisode = {
  id: string;
  week: string;
  title: string;
  situation: string;
  verdict: StalledDealVerdict;
  blocker: string;
  nextAction: string;
  loomId: string;
};

export const STALLED_DEAL_SERIES: StalledDealEpisode[] = [
  {
    id: "week-2",
    week: "Week 2",
    title: "Recovering a Stalled Deal With Missing Key Personnel",
    situation: "A stalled deal where a key person is missing from the buying group.",
    verdict: "recoverable",
    blocker: "The deal story is incomplete because that person is not in the room.",
    nextAction: "Name who is missing before this deal stays on the forecast.",
    loomId: "aedc90f0b86d466599f69856f3974228",
  },
  {
    id: "week-1",
    week: "Week 1",
    title: "Deterministic Engine to Recover Stalled Deals",
    situation: "A stalled deal, run through the fixed-rule engine.",
    verdict: "recoverable",
    blocker: "A general AI can give a different answer the next time you paste the same call.",
    nextAction: "Score the deal with fixed rules you can defend in the room.",
    loomId: "3d22fb3f9c7b48f6ac9b2d3b713b4c39",
  },
];

export function loomEmbedUrl(loomId: string): string {
  return `https://www.loom.com/embed/${loomId}?autoplay=0`;
}

export const WALKTHROUGH_EMBED_URL = loomEmbedUrl(STALLED_DEAL_SERIES[0].loomId);

export const SITE_ORIGIN = "https://www.getldr.ca";

export const FOUNDER_NAME = "Joshua Bennett";

export const COMPANY_LINKEDIN = "https://www.linkedin.com/company/lazarus-deal-recovery";

export const SITE_TITLE = "Deal Recovery Software for Stalled B2B Sales | Lazarus";

export const SITE_DESCRIPTION =
  "Lazarus helps sales teams turn stalled pipeline into recovery work: whether a deal is recoverable, what is blocking it, and what to do next. Five free analyses a month.";

export const SEO_PATHS = {
  dealRecovery: "/deal-recovery",
  stalled: "/stalled-deal-recovery",
  closedLost: "/closed-lost-deal-recovery",
  plan: "/deal-recovery-plan",
  howTo: "/how-to-recover-a-stalled-b2b-deal",
  integrations: "/integrations",
} as const;

export const OG_TITLE = SITE_TITLE;

export const OG_DESCRIPTION = SITE_DESCRIPTION;

export const PILLAR_PATH = SEO_PATHS.howTo;

const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROBOTS_NOINDEX = "noindex, nofollow";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function applyDocumentMeta(opts: {
  title: string;
  description?: string;
  robots?: "index" | "noindex";
}) {
  document.title = opts.title;
  upsertMeta("property", "og:title", opts.title);
  upsertMeta("name", "twitter:title", opts.title);
  if (opts.description) {
    upsertMeta("name", "description", opts.description);
    upsertMeta("property", "og:description", opts.description);
    upsertMeta("name", "twitter:description", opts.description);
  }
  upsertMeta("name", "robots", opts.robots === "noindex" ? ROBOTS_NOINDEX : ROBOTS_INDEX);
  upsertMeta("name", "googlebot", opts.robots === "noindex" ? ROBOTS_NOINDEX : "index, follow");
}
