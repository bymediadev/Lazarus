import { FOUNDER_EMAIL, FOUNDER_LINKEDIN, FOUNDER_NAME } from "../lib/site";
import { SHARE_LINKS, type Arrival } from "./arrival";

/** Default words that unlock the qualify link. Override with OFF_HOURS_KEYWORDS. */
export const DEFAULT_KEYWORDS = [
  "qualify",
  "forecast",
  "stalled",
  "triage",
  "recoverable",
  "yes",
  "interested",
  "book",
] as const;

export function parseKeywords(raw = ""): string[] {
  const fromEnv = raw
    .split(/[,|\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : [...DEFAULT_KEYWORDS];
}

/** First matching keyword in the message, or null. */
export function matchKeyword(text: string, keywords = parseKeywords()): string | null {
  const bag = text.toLowerCase();
  if (!bag.trim()) return null;
  for (const word of keywords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(bag)) return word;
  }
  return null;
}

export function inviteLink(channel: Arrival): string {
  if (channel === "linkedin") return SHARE_LINKS.linkedin;
  if (channel === "email") return SHARE_LINKS.email;
  return SHARE_LINKS.site;
}

/** Short reply. Opens the qualifier in one click. */
export function inviteCopy(input: {
  channel: Arrival;
  name?: string;
  keyword?: string | null;
}): { subject: string; text: string; link: string } {
  const link = inviteLink(input.channel);
  const who = input.name?.trim() || "";
  const hello = who ? `${who} —` : "Quick —";
  const text = [
    hello,
    "",
    "Open this. It takes under a minute.",
    "",
    link,
    "",
    "Paste one stalled call. You will see recoverable or flat no before your next forecast call.",
    "",
    FOUNDER_NAME,
    FOUNDER_EMAIL,
    FOUNDER_LINKEDIN,
  ].join("\n");
  return {
    subject: "Your stalled deal — under a minute",
    text,
    link,
  };
}
