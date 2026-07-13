import { API_BASE, apiAuthHeaders } from "./api";

export interface ZoomIntegrationStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
  rtms_supported: boolean;
  note: string;
}

export interface ZoomLiveSession {
  sessionId: string;
  platform: "zoom";
}

export interface ZoomTranscriptChunk {
  speaker: string;
  dialogue: string;
  timestamp: string;
  source: "zoom_rtms" | "manual";
}

export async function fetchZoomStatus(): Promise<ZoomIntegrationStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/zoom/status`);
  if (!res.ok) throw new Error(`Zoom status failed (${res.status})`);
  return res.json() as Promise<ZoomIntegrationStatus>;
}

export function zoomConnectUrl(): string {
  return `${API_BASE}/api/integrations/zoom/connect`;
}

export async function disconnectZoom(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/zoom/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function startZoomLiveSession(): Promise<ZoomLiveSession> {
  const res = await fetch(`${API_BASE}/api/integrations/zoom/live-session/start`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  const data = (await res.json()) as ZoomLiveSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Start session failed (${res.status})`);
  return data;
}

export function subscribeZoomTranscriptStream(
  sessionId: string,
  onChunk: (chunk: ZoomTranscriptChunk) => void,
  onError?: (message: string) => void
): () => void {
  const url = `${API_BASE}/api/integrations/zoom/live-transcript/stream?sessionId=${encodeURIComponent(sessionId)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const chunk = JSON.parse(event.data) as ZoomTranscriptChunk;
      onChunk(chunk);
    } catch {
      /* ignore malformed */
    }
  };

  source.onerror = () => {
    onError?.("Zoom live transcript stream disconnected");
  };

  return () => source.close();
}
