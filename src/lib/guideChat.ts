import { API_BASE, apiAuthHeaders } from "./api";

export interface GuideChatResponse {
  answer: string;
  steps: string[];
}

export async function askGuideChat(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<GuideChatResponse> {
  const res = await fetch(`${API_BASE}/api/guide/chat`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ question, history }),
  });
  const data = (await res.json()) as GuideChatResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Guide chat failed (${res.status})`);
  return data;
}
