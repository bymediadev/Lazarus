export type Arrival = "site" | "email" | "linkedin";

/** Live share links. Each channel is its own page, so a preview cannot collapse it onto the homepage. */
export const SHARE_LINKS = {
  linkedin: "https://www.getldr.ca/qualify/linkedin",
  email: "https://www.getldr.ca/qualify/email",
  site: "https://www.getldr.ca/qualify",
} as const;

/** Path pages win. Query tags still work for links already sent. */
export function arrivalFromPath(pathname = ""): Arrival | null {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path === "/qualify/linkedin") return "linkedin";
  if (path === "/qualify/email") return "email";
  return null;
}

/** Email and LinkedIn open the qualifier on arrival. A normal site visit uses the dock timer. */
export function readArrival(search = "", referrer = "", pathname = ""): Arrival {
  const fromPath = arrivalFromPath(pathname);
  if (fromPath) return fromPath;
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const bag = [params.get("from"), params.get("src"), params.get("utm_source"), params.get("utm_medium"), referrer]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toLowerCase();

  if (/linkedin|lnkd\.in|(^|\s)li($|\s)/.test(bag)) return "linkedin";
  if (/e-?mail|newsletter|mail\.google|outlook|yahoo\.com\/mail|proton\.me/.test(bag)) return "email";
  return "site";
}

export function arrivalOpensNow(arrival: Arrival): boolean {
  return arrival === "email" || arrival === "linkedin";
}

/** Home visits from LinkedIn or email go to that channel's qualify page. */
export function qualifySharePath(search = "", referrer = ""): string | null {
  const arrival = readArrival(search, referrer);
  if (arrival === "linkedin") return "/qualify/linkedin";
  if (arrival === "email") return "/qualify/email";
  return null;
}
