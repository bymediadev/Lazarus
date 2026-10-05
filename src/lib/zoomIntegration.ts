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
  sessionSecret: string;
  streamTicket: string;
  platform: "zoom";
}

export interface ZoomTranscriptChunk {
  speaker: string;
  dialogue: string;
  timestamp: string;
  source: "zoom_rtms" | "manual";
}

export async function fetchZoomStatus(): Promise<ZoomIntegrationStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/zoom/status`, {
    headers: apiAuthHeaders(),
  });
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
    body: JSON.stringify({ consent: true }),
  });
  const data = (await res.json()) as ZoomLiveSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Start session failed (${res.status})`);
  return data;
}

async function refreshZoomStreamTicket(sessionId: string, sessionSecret: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/integrations/zoom/live-transcript/ticket`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ sessionId, sessionSecret }),
  });
  const data = (await res.json()) as { ticket?: string; error?: string };
  if (!res.ok || !data.ticket) throw new Error(data.error ?? "Could not refresh the live stream");
  return data.ticket;
}

export function subscribeZoomTranscriptStream(
  sessionId: string,
  sessionSecret: string,
  onChunk: (chunk: ZoomTranscriptChunk) => void,
  onError?: (message: string) => void,
  streamTicket?: string
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let retries = 0;

  const connect = (ticket: string) => {
    if (closed) return;
    source?.close();
    source = new EventSource(
      `${API_BASE}/api/integrations/zoom/live-transcript/stream?ticket=${encodeURIComponent(ticket)}`
    );
    source.onmessage = (event) => {
      try {
        const chunk = JSON.parse(event.data) as ZoomTranscriptChunk;
        onChunk(chunk);
      } catch {
        /* ignore malformed */
      }
    };
    source.onerror = () => {
      source?.close();
      if (closed) return;
      if (retries >= 3) {
        onError?.("Zoom live transcript stream disconnected");
        return;
      }
      retries += 1;
      void refreshZoomStreamTicket(sessionId, sessionSecret)
        .then(connect)
        .catch(() => onError?.("Zoom live transcript stream disconnected"));
    };
  };

  if (streamTicket) connect(streamTicket);
  else {
    void refreshZoomStreamTicket(sessionId, sessionSecret)
      .then(connect)
      .catch(() => onError?.("Zoom live transcript stream disconnected"));
  }

  return () => {
    closed = true;
    source?.close();
  };
}
