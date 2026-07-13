import { API_BASE, apiAuthHeaders } from "./api";

export type LiveObjectionStatus = "open" | "answered" | "dismissed";

export interface LiveObjection {
  id: string;
  text: string;
  speaker?: string;
  evidence?: string;
  status: LiveObjectionStatus;
  source: "ai" | "manual";
  createdAt: string;
  answeredAt?: string;
}

export interface LiveObjectionScanResult {
  new_objections: { text: string; speaker?: string; evidence?: string }[];
  resolved_ids: string[];
}

export function createObjection(
  text: string,
  source: "ai" | "manual",
  extra?: { speaker?: string; evidence?: string }
): LiveObjection {
  return {
    id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    speaker: extra?.speaker,
    evidence: extra?.evidence,
    status: "open",
    source,
    createdAt: new Date().toISOString(),
  };
}

export async function scanLiveObjections(
  fullTranscript: string,
  existing: LiveObjection[]
): Promise<LiveObjectionScanResult> {
  const res = await fetch(`${API_BASE}/api/live/objections`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      full_transcript: fullTranscript,
      existing_objections: existing.map((o) => ({
        id: o.id,
        text: o.text,
        status: o.status,
      })),
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const err = contentType.includes("json")
      ? ((await res.json()) as { error?: string }).error
      : await res.text();
    throw new Error(err || `Live scan failed (${res.status})`);
  }

  return res.json() as Promise<LiveObjectionScanResult>;
}

export function mergeScanResults(
  current: LiveObjection[],
  scan: LiveObjectionScanResult
): LiveObjection[] {
  const now = new Date().toISOString();
  let next = current.map((o) =>
    scan.resolved_ids.includes(o.id) && o.status === "open"
      ? { ...o, status: "answered" as const, answeredAt: now }
      : o
  );

  for (const item of scan.new_objections) {
    const dup = next.some(
      (o) =>
        o.status === "open" &&
        o.text.toLowerCase().slice(0, 40) === item.text.toLowerCase().slice(0, 40)
    );
    if (!dup && item.text.trim()) {
      next = [...next, createObjection(item.text, "ai", item)];
    }
  }

  return next;
}

export function openObjections(objections: LiveObjection[]): LiveObjection[] {
  return objections.filter((o) => o.status === "open");
}
