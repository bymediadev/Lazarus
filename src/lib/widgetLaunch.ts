import { API_BASE, apiAuthHeaders } from "./api";
import { establishSessionFromBridge } from "./auth";
import type { MeetingPlatformId } from "./meetingPlatforms";

export async function mintWidgetLaunchLink(
  widget: MeetingPlatformId
): Promise<{ url: string; widget: MeetingPlatformId }> {
  const res = await fetch(`${API_BASE}/api/integrations/widget/launch-link`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ widget }),
  });
  const data = (await res.json()) as { error?: string; url?: string; widget?: MeetingPlatformId };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open widget as this account");
  return { url: data.url, widget: data.widget ?? widget };
}

/** Consume ?launch= on /portal so Teams/Zoom/Meet open as the same Lazarus user. */
export async function consumeWidgetLaunchFromUrl(
  search = typeof window === "undefined" ? "" : window.location.search
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(search);
  const launch = (params.get("launch") ?? "").trim();
  if (!launch) return false;

  const res = await fetch(`${API_BASE}/api/integrations/widget/launch-consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ launch }),
  });
  const data = (await res.json()) as {
    error?: string;
    email?: string;
    token_hash?: string | null;
    email_otp?: string | null;
  };
  if (!res.ok) throw new Error(data.error ?? "Launch link is invalid or expired.");

  await establishSessionFromBridge({
    email: data.email,
    token_hash: data.token_hash,
    email_otp: data.email_otp,
  });

  params.delete("launch");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({}, "", next);
  return true;
}
