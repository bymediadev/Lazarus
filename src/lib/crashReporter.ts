import { API_BASE, apiAuthHeaders } from "./api";

const ENDPOINT = `${API_BASE}/api/telemetry/crash`;
const SESSION_CAP = 8;
let sent = 0;

function releaseSha(): string | null {
  try {
    const viteEnv = (
      import.meta as ImportMeta & { env?: Record<string, string | undefined> }
    ).env;
    return (viteEnv?.VITE_GIT_SHA ?? "").trim().slice(0, 12) || null;
  } catch {
    return null;
  }
}

function payload(message: string, stack?: string): string {
  return JSON.stringify({
    message: message.slice(0, 400),
    stack: stack?.slice(0, 4000) ?? null,
    url: typeof window !== "undefined" ? window.location.href.slice(0, 400) : null,
    release: releaseSha(),
  });
}

export function reportClientCrash(message: string, stack?: string): void {
  if (sent >= SESSION_CAP) return;
  sent += 1;
  try {
    const body = payload(message, stack);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: {
        ...apiAuthHeaders(true),
      },
      body,
      keepalive: true,
    });
  } catch {
    /* never throw from the crash reporter */
  }
}

export function installCrashReporter(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    const err = event.error;
    const message =
      (err instanceof Error ? err.message : event.message) || "Unhandled error";
    const stack = err instanceof Error ? err.stack : undefined;
    reportClientCrash(message, stack);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : undefined;
    reportClientCrash(message, stack);
  });
}
