/** A public website the prospect typed. No address, no local host. */
export function companyDomain(raw: string): string | null {
  const text = raw.trim();
  if (!text || text.length > 200) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return null;
  const labels = host.split(".");
  if (labels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) return null;
  return host;
}

export type PreCallFacts = {
  domain: string;
  profile: string;
  account: string;
  acv: string;
  owner: string;
  forecastLabel: string;
  slotLabel: string;
  verdict: string;
  blocker: string;
};

/** Prefixed onto the call before scoring. Facts they typed plus the site blurb — not dialogue. */
export function formatCompanyScoreContext(input: {
  domain: string;
  profile: string;
  account?: string;
  amount?: string;
}): string {
  const domain = input.domain.trim() || "—";
  const profile = input.profile.trim() || "The site did not publish a description.";
  const account = input.account?.trim() || "—";
  const amount = input.amount?.trim() || "—";
  return [
    "--- COMPANY CONTEXT (not call dialogue) ---",
    `Prospect site: ${domain}`,
    `Published description: ${profile}`,
    `Account at risk: ${account}`,
    `Amount at risk: ${amount}`,
    "--- CALL TRANSCRIPT ---",
  ].join("\n");
}

/** Walk-in card. Every line is a fact they typed or the score returned. */
export function preCallBrief(input: PreCallFacts): string {
  const profile = input.profile.trim() || "The site did not publish a description.";
  const account = input.account.trim() || "—";
  const blocker = input.blocker.trim() || "The score did not name a blocker.";
  const forecast = input.forecastLabel.trim() || "—";
  return [
    "LAZARUS PRE-CALL BRIEFING",
    "",
    `Prospect: ${input.domain || "—"}`,
    `Company: ${profile}`,
    `Account at risk: ${account} (${input.acv.trim() || "—"})`,
    `Forecast owner: ${input.owner.trim() || "—"}. Forecast call ${forecast}. Morning ${input.slotLabel.trim() || "—"}.`,
    "",
    `Verdict: ${input.verdict.trim() || "—"}`,
    `Break: ${blocker}`,
    "",
    "15 minutes",
    `1. Open on ${input.domain || "their site"} and ${account}. Name the amount they put at risk.`,
    `2. The break on the call: ${blocker}`,
    `3. The next action before ${forecast}. A flat no comes off the forecast. A recoverable deal gets the action the owner will run.`,
  ].join("\n");
}
