import { API_BASE, apiAuthHeaders } from "./api";

export interface TeamsStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
  note: string;
}

export async function fetchTeamsStatus(): Promise<TeamsStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/teams/status`);
  if (!res.ok) throw new Error(`Teams status failed (${res.status})`);
  return res.json() as Promise<TeamsStatus>;
}

export function teamsConnectUrl(): string {
  return `${API_BASE}/api/integrations/teams/connect`;
}

export async function disconnectTeams(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/teams/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}
