import { API_BASE, apiAuthHeaders } from "./api";

/** Start a logged-in OAuth connect (POST returns the provider URL). */
export async function startLoggedInOAuthConnect(slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/${slug}/connect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (res.status === 401) {
    throw new Error("Sign in first, then connect this integration.");
  }
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Could not start connect.");
  }
  const popup = window.open(
    data.url,
    `lazarus-${slug}-oauth`,
    "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
  );
  if (!popup) throw new Error("Allow popups to connect.");
  popup.focus();
}
