export type Arrival = "site" | "email" | "linkedin";

/** Live share links. Put these in LinkedIn and email. The qualifier opens on that page. */
export const SHARE_LINKS = {
  linkedin: "https://www.getldr.ca/qualify?from=linkedin",
  email: "https://www.getldr.ca/qualify?from=email",
  site: "https://www.getldr.ca/qualify",
} as const;

/** Email and LinkedIn open the qualifier on arrival. A normal site visit uses the dock timer. */
export function readArrival(search = "", referrer = ""): Arrival {
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

/** Home visits from LinkedIn or email go to the full /qualify page with the same tags. */
export function qualifySharePath(search = "", referrer = ""): string | null {
  const arrival = readArrival(search, referrer);
  if (!arrivalOpensNow(arrival)) return null;
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (!params.get("from")) params.set("from", arrival);
  const next = params.toString();
  return next ? `/qualify?${next}` : "/qualify";
}
