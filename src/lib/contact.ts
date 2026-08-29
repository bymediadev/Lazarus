import { API_BASE, apiAuthHeaders } from "./api";

export type ContactTopic = "feedback" | "sales" | "technical" | "support";

export const CONTACT_TOPICS: { id: ContactTopic; label: string; hint: string }[] = [
  { id: "feedback", label: "Feedback", hint: "Product notes for the founder." },
  { id: "sales", label: "Sales", hint: "Pricing, pilots, and demos. Book a 30-minute look below." },
  { id: "technical", label: "Technical", hint: "Integrations and setup." },
  { id: "support", label: "Support", hint: "Account and billing." },
];

export function contactInboxEmail(topic: ContactTopic): string {
  if (topic === "feedback") return "joshua@getldr.ca";
  if (topic === "sales") return "sales@getldr.ca";
  return "support@getldr.ca";
}

export function contactMailto(input: {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
}): string {
  const to = contactInboxEmail(input.topic);
  const who = input.name.trim() || input.email.trim() || "website";
  const subject = encodeURIComponent(`[${input.topic}] Lazarus contact from ${who}`);
  const body = encodeURIComponent(
    `From: ${input.name.trim() || "—"} <${input.email.trim()}>\n\n${input.message.trim()}`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

export async function sendContactNote(input: {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  company_website?: string;
}): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: apiAuthHeaders(true),
      body: JSON.stringify({
        topic: input.topic,
        name: input.name,
        email: input.email,
        message: input.message,
        company_website: input.company_website ?? "",
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(
        "The server is waking up. Use the email link below, or try Send again in a minute."
      );
    }
    if (err instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Use the email link below, or try Send again in a minute."
      );
    }
    throw err;
  }
}
