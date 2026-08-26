/** Guest freemium usage — client-side counter (server also soft-limits non-founder). */

export const GUEST_ANALYSIS_CAP = 5;
const STORAGE_KEY = "lazarus_guest_analyses";
const DEMO_BYPASS_KEY = "lazarus_demo_bypass";

/** Founder demo account — the only email with uncapped free analyses. */
export const FOUNDER_UNLIMITED_EMAILS = ["joshua.bennett003@gmail.com"] as const;

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True for the founder account that skips free-analysis limits. */
export function isFounderUnlimitedEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  if ((FOUNDER_UNLIMITED_EMAILS as readonly string[]).includes(e)) return true;
  try {
    const viteEnv = (
      import.meta as ImportMeta & { env?: Record<string, string | undefined> }
    ).env;
    const extra = (viteEnv?.VITE_FOUNDER_EMAILS ?? "")
      .split(",")
      .map((x: string) => x.trim().toLowerCase())
      .filter(Boolean);
    return extra.includes(e);
  } catch {
    return false;
  }
}

function readCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    /* private mode */
  }
}

/** Capture ?demo=1 once so shared demo machines stay unlocked for the tab session. */
export function captureDemoBypassFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      sessionStorage.setItem(DEMO_BYPASS_KEY, "1");
      return true;
    }
  } catch {
    /* ignore */
  }
  return isDemoBypassActive();
}

export function isDemoBypassActive(): boolean {
  const viteEnv = (
    import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  ).env;
  if ((viteEnv?.VITE_GUEST_USAGE_BYPASS ?? "").trim().toLowerCase() === "true") {
    return true;
  }
  try {
    return sessionStorage.getItem(DEMO_BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}

export function getGuestUsage(): number {
  return readCount();
}

export function guestAnalysesRemaining(): number {
  return Math.max(0, GUEST_ANALYSIS_CAP - readCount());
}

export function isGuestUsageLocked(): boolean {
  return readCount() >= GUEST_ANALYSIS_CAP;
}

/** True when one free run remains (warn before lock). */
export function isGuestUsageNearCap(): boolean {
  return guestAnalysesRemaining() === 1;
}

export function incrementGuestUsage(): number {
  const next = readCount() + 1;
  writeCount(next);
  return next;
}

/**
 * Free-analysis cap applies to everyone except the founder account (and ops role / demo bypass).
 * Regular signed-in users still hit the freemium lock — demos run on the founder login.
 */
export function shouldEnforceGuestCap(opts: {
  signedIn?: boolean;
  opsUser?: boolean;
  email?: string | null;
}): boolean {
  // Founder email wins even before /api/founder/me resolves
  if (isFounderUnlimitedEmail(opts.email)) return false;
  if (opts.opsUser) return false;
  if (isDemoBypassActive()) return false;
  return true;
}

export function guestCapLockMessage(signedIn = false): string {
  if (signedIn) {
    return `You’ve used your ${GUEST_ANALYSIS_CAP} free analyses. If you need more, $10 per extra report or a monthly plan is in your account.`;
  }
  return `You’ve used your ${GUEST_ANALYSIS_CAP} free analyses. Sign in if you want to keep going — $10 per extra report, or a monthly plan when volume shows up.`;
}

export function guestNearCapMessage(): string {
  return "1 free analysis left. After that you can buy one more report or a monthly plan — only if you need it.";
}
