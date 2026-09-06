import { API_BASE } from "./api";

/** Publish logged-in Lazarus identity (and optional live session) to the Meet captions extension. */
export function publishMeetAccountPair(detail: {
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  sessionSecret?: string | null;
}): void {
  if (typeof document === "undefined") return;
  const payload = {
    type: "lazarus-meet-session",
    userId: detail.userId ?? "",
    userEmail: detail.userEmail ?? "",
    sessionId: detail.sessionId ?? "",
    sessionSecret: detail.sessionSecret ?? "",
    apiBase: API_BASE || "https://lazarus-4uxi.onrender.com",
  };

  let el = document.getElementById("lazarus-meet-pair");
  if (!el) {
    el = document.createElement("div");
    el.id = "lazarus-meet-pair";
    el.setAttribute("hidden", "true");
    document.body.appendChild(el);
  }
  el.setAttribute("data-user-id", payload.userId);
  el.setAttribute("data-user-email", payload.userEmail);
  el.setAttribute("data-session-id", payload.sessionId);
  el.setAttribute("data-session-secret", payload.sessionSecret);
  el.setAttribute("data-api-base", payload.apiBase);

  window.postMessage(payload, window.location.origin);
}

export function clearMeetAccountPair(): void {
  publishMeetAccountPair({});
}
