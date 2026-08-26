import { API_BASE, apiAuthHeaders } from "./api";

export type ContactTopic = "feedback" | "sales" | "technical" | "support";

export const CONTACT_TOPICS: { id: ContactTopic; label: string; hint: string }[] = [
  { id: "feedback", label: "Feedback", hint: "Goes to Joshua" },
  { id: "sales", label: "Sales", hint: "Goes to sales@getldr.ca" },
  { id: "technical", label: "Technical", hint: "Goes to support@getldr.ca" },
  { id: "support", label: "Support", hint: "Goes to support@getldr.ca" },
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
