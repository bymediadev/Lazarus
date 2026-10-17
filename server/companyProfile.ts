import { lookup } from "node:dns/promises";
import { companyDomain } from "../src/qualifier/brief.js";

/** Refuse loopback, private, link-local, and carrier-grade ranges. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (ip.includes(":")) {
    const head = (ip.toLowerCase().split(":")[0] || "0").padStart(4, "0");
    const word = Number.parseInt(head.slice(0, 4), 16);
    if (!Number.isFinite(word)) return true;
    if (ip === "::1" || ip === "::") return true;
    if (word >= 0xfc00 && word <= 0xfdff) return true;
    if (word >= 0xfe80 && word <= 0xfebf) return true;
    return false;
  }
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title and description the homepage published. No other inference. */
export function profileFromHtml(html: string): string {
  const title = decode(html.match(/<title[^>]*>([^<]{1,180})<\/title>/i)?.[1] ?? "");
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+name=["']description["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,400})["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']{1,400})["'][^>]+property=["']og:description["']/i)?.[1] ??
      ""
  );
  const line = description || title;
  if (!line) return "The site did not publish a description.";
  return line.slice(0, 220);
}

async function publicHost(host: string): Promise<boolean> {
  const domain = companyDomain(host);
  if (!domain) return false;
  const addresses = await lookup(domain, { all: true });
  return addresses.length > 0 && addresses.every((item) => !isPrivateAddress(item.address));
}

async function readHtml(url: string, hops = 0): Promise<string> {
  if (!(await publicHost(new URL(url).hostname))) {
    throw new Error("private");
  }
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "text/html", "User-Agent": "LazarusDealRecovery/briefing" },
    signal: AbortSignal.timeout(4_000),
  });
  if (response.status >= 300 && response.status < 400) {
    if (hops >= 2) return "";
    const next = response.headers.get("location");
    if (!next) return "";
    const resolved = new URL(next, url);
    if (resolved.protocol !== "https:") return "";
    return readHtml(resolved.origin + "/", hops + 1);
  }
  if (!response.ok) return "";
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(type)) return "";
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cap = 150_000;
  while (total < cap) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    total += step.value.byteLength;
  }
  reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, cap));
}

export async function readCompanyProfile(raw: string): Promise<{ domain: string; profile: string }> {
  const domain = companyDomain(raw);
  if (!domain) return { domain: "", profile: "The website was not a public domain." };
  try {
    const html = await readHtml(`https://${domain}/`);
    return { domain, profile: profileFromHtml(html) };
  } catch {
    return { domain, profile: "The site did not answer." };
  }
}
