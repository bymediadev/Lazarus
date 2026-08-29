export const BOOKING_URL = "https://calendly.com/getldr-sales/30min";

/** Hosted Stripe Payment Links — pricing CTAs skip the Render API. */
export const STRIPE_PAYMENT_LINKS = {
  ppu: "https://buy.stripe.com/28EcN7bns3Ph6m4c9x4Ja00",
  entry: "https://buy.stripe.com/fZu9AVgHMbhJ25OflJ4Ja01",
  team: "https://buy.stripe.com/4gM14p1MSgC3bGo6Pd4Ja02",
} as const;

export const WALKTHROUGH_EMBED_URL =
  "https://www.loom.com/embed/a4fb54eb44d54202bbbbcac771c8ec59";

export const SITE_ORIGIN = "https://www.getldr.ca";

export const SITE_TITLE = "Lazarus Deal Recovery | Win Back Closed-Lost Sales Pipeline";

export const SITE_DESCRIPTION =
  "Lazarus reads the recording, transcript, and HubSpot notes, then names the blocker and a 0–90 day plan you paste into HubSpot. No meeting bot. Five free analyses.";

export const OG_TITLE = "Lazarus Deal Recovery | Win Back Closed-Lost Sales";

export const OG_DESCRIPTION =
  "Lazarus names the blocker and a 0–90 day plan you paste into HubSpot notes. No meeting bot. Connect with OAuth. Five free analyses.";

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
  if (opts.description) {
    upsertMeta("name", "description", opts.description);
  }
  upsertMeta("name", "robots", opts.robots === "noindex" ? ROBOTS_NOINDEX : ROBOTS_INDEX);
  upsertMeta("name", "googlebot", opts.robots === "noindex" ? ROBOTS_NOINDEX : "index, follow");
}
