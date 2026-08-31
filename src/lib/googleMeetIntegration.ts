import { API_BASE, apiAuthHeaders } from "./api";

export interface GoogleMeetStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
  live_captions?: boolean;
  note: string;
}

export interface MeetLiveSession {
  sessionId: string;
  sessionSecret: string;
  platform: "meet";
}

export interface MeetTranscriptChunk {
  speaker: string;
  dialogue: string;
  timestamp: string;
  source: "meet_captions" | "manual";
}

export async function fetchGoogleMeetStatus(): Promise<GoogleMeetStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/google/status`, {
    headers: apiAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Google status failed (${res.status})`);
  return res.json() as Promise<GoogleMeetStatus>;
}

export function googleMeetConnectUrl(): string {
  return `${API_BASE}/api/integrations/google/connect`;
}

export async function disconnectGoogleMeet(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/google/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

/** API the Meet captions extension should POST to (Pages bake VITE_API_URL; local Vite proxies). */
export function meetCaptionApiBase(): string {
  if (API_BASE) return API_BASE;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3001";
  }
  return "https://lazarus-4uxi.onrender.com";
}

export function publishMeetSessionToExtension(sessionId: string, sessionSecret = ""): void {
  const apiBase = meetCaptionApiBase();
  window.postMessage(
    { type: "lazarus-meet-session", sessionId, sessionSecret, apiBase },
    window.location.origin
  );
}

export async function startMeetLiveSession(): Promise<MeetLiveSession> {
  const res = await fetch(`${API_BASE}/api/integrations/google/live-session/start`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  const data = (await res.json()) as MeetLiveSession & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Start session failed (${res.status})`);
  return data;
}

export function subscribeMeetTranscriptStream(
  sessionId: string,
  sessionSecret: string,
  onChunk: (chunk: MeetTranscriptChunk) => void,
  onError?: (message: string) => void
): () => void {
  const url = `${API_BASE}/api/integrations/google/live-transcript/stream?sessionId=${encodeURIComponent(sessionId)}&sessionSecret=${encodeURIComponent(sessionSecret)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const chunk = JSON.parse(event.data) as MeetTranscriptChunk;
      onChunk(chunk);
    } catch {
      /* ignore malformed */
    }
  };

  source.onerror = () => {
    onError?.("Meet live caption stream disconnected");
  };

  return () => source.close();
}
