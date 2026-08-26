import { API_BASE, apiAuthHeaders } from "./api";

export type ContactTopic = "feedback" | "sales" | "technical" | "support";

export const CONTACT_TOPICS: { id: ContactTopic; label: string; hint: string }[] = [
  { id: "feedback", label: "Feedback", hint: "Product notes for the founder." },
  { id: "sales", label: "Sales", hint: "Pricing, pilots, and demos." },
  { id: "technical", label: "Technical", hint: "Integrations and setup." },
  { id: "support", label: "Support", hint: "Account and billing." },
];

export async function sendContactNote(input: {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  company_website?: string;
}): Promise<void> {
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
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
}
