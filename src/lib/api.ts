import { PostMortemResult } from "../types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface PostMortemResponse extends PostMortemResult {
  id?: string | null;
  sources?: { audio: boolean; manual: boolean };
}

export interface PostMortemPayload {
  file?: File | null;
  transcript?: string;
  dealValue: string;
}

export async function runPostMortem(payload: PostMortemPayload): Promise<PostMortemResponse> {
  const formData = new FormData();

  if (payload.file) {
    formData.append("recording", payload.file);
  }

  const manual = payload.transcript?.trim();
  if (manual) {
    formData.append("transcript", manual);
  }

  formData.append("deal_value", payload.dealValue || "0");

  const res = await fetch(`${API_BASE}/api/post-mortem`, {
    method: "POST",
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as PostMortemResponse & { error?: string })
    : null;

  if (!res.ok) {
    throw new Error(data?.error || `Post-mortem failed (${res.status}).`);
  }

  if (!data) {
    throw new Error(
      API_BASE
        ? `API at ${API_BASE} returned a non-JSON response.`
        : "API server unavailable. Run npm run dev to start the backend."
    );
  }

  return data;
}

export async function checkHealth(): Promise<{
  status: string;
  gemini: boolean;
  assemblyai: boolean;
  supabase: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}
