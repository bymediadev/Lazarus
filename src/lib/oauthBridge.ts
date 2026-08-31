/** Cross-tab OAuth completion — survives Google COOP clearing window.opener. */

export type OAuthCompleteDetail = {
  type: "lazarus-oauth-complete";
  provider: string;
  outcome: string;
  reason?: string | null;
  loginCode?: string | null;
};

const CHANNEL = "lazarus-oauth";
const STORAGE_KEY = "lazarus-oauth-complete";

function isOAuthDetail(value: unknown): value is OAuthCompleteDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "lazarus-oauth-complete" &&
    typeof v.provider === "string" &&
    typeof v.outcome === "string"
  );
}

/** Notify every same-origin Lazarus tab (opener may be null after Google redirect). */
export function publishOAuthComplete(detail: {
  provider: string;
  outcome: string;
  reason?: string | null;
  loginCode?: string | null;
}): void {
  const payload: OAuthCompleteDetail = {
    type: "lazarus-oauth-complete",
    provider: detail.provider,
    outcome: detail.outcome,
    reason: detail.reason ?? null,
    loginCode: detail.loginCode ?? null,
  };

  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* older browsers */
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, t: Date.now() }));
  } catch {
    /* private mode */
  }

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage(payload, window.location.origin);
    } catch {
      /* ignore */
    }
  }

  window.dispatchEvent(new CustomEvent("lazarus-oauth-complete", { detail: payload }));
}

export function subscribeOAuthComplete(
  handler: (detail: OAuthCompleteDetail) => void
): () => void {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<OAuthCompleteDetail>).detail;
    if (isOAuthDetail(detail)) handler(detail);
  };

  const onMessage = (event: MessageEvent) => {
    if (isOAuthDetail(event.data)) handler(event.data);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as unknown;
      if (isOAuthDetail(parsed)) handler(parsed);
    } catch {
      /* ignore */
    }
  };

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (event) => {
      if (isOAuthDetail(event.data)) handler(event.data);
    };
  } catch {
    bc = null;
  }

  window.addEventListener("lazarus-oauth-complete", onCustom);
  window.addEventListener("message", onMessage);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("lazarus-oauth-complete", onCustom);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
    bc?.close();
  };
}
