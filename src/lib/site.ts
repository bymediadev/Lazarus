export const BOOKING_URL = "https://calendly.com/joshua-bennett003-2acf/30min";

export const WALKTHROUGH_EMBED_URL =
  "https://www.loom.com/embed/a4fb54eb44d54202bbbbcac771c8ec59";

export const SITE_ORIGIN = "https://www.getldr.ca";

export const SITE_TITLE = "Lazarus Deal Recovery | Win Back Closed-Lost Sales Pipeline";

export const SITE_DESCRIPTION =
  "Stop chasing stalled B2B pipeline. Lazarus reads the recording, transcript, and email thread, then names the blocker and a 0–90 day CRM plan. No meeting bot. Five free analyses.";

export const OG_TITLE = "Lazarus Deal Recovery | Win Back Closed-Lost Sales";

export const OG_DESCRIPTION =
  "Stop chasing stalled B2B pipeline. Lazarus names the blocker and a 0–90 day plan you can paste into the CRM. No meeting bot. Five free analyses.";

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
