import { API_BASE, apiAuthHeaders } from "./api";

export interface GoogleMeetStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
  note: string;
}

export async function fetchGoogleMeetStatus(): Promise<GoogleMeetStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/google/status`);
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
