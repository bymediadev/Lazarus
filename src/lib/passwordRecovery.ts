/** Sticky password-recovery intent — survives PKCE URL cleanup + React Strict Mode. */

const RECOVERY_FLAG = "lazarus_password_recovery";
const AWAITING_FLAG = "lazarus_awaiting_password_reset";
const AWAITING_MAX_MS = 24 * 60 * 60 * 1000;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function isPasswordRecoveryPending(): boolean {
  return storageGet(RECOVERY_FLAG) === "1";
}

export function isAwaitingPasswordReset(): boolean {
  const raw = storageGet(AWAITING_FLAG);
  if (!raw) return false;
  const started = Number(raw);
  if (!Number.isFinite(started) || Date.now() - started > AWAITING_MAX_MS) {
    storageRemove(AWAITING_FLAG);
    return false;
  }
  return true;
}

export function markPasswordRecoveryPending(): void {
  storageSet(RECOVERY_FLAG, "1");
}

export function markAwaitingPasswordReset(): void {
  storageSet(AWAITING_FLAG, String(Date.now()));
}

export function clearPasswordRecoveryState(): void {
  storageRemove(RECOVERY_FLAG);
  storageRemove(AWAITING_FLAG);
}

/** Call once at module load — Supabase PKCE strips the URL before React effects run. */
export function capturePasswordRecoveryFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const resetHint =
      query.get("lazarus_reset") === "1" ||
      hash.get("lazarus_reset") === "1" ||
      query.get("type") === "recovery" ||
      hash.get("type") === "recovery";
    const pkceReturn = Boolean(query.get("code") || hash.get("access_token"));

    if (resetHint || (pkceReturn && isAwaitingPasswordReset())) {
      markPasswordRecoveryPending();
      return true;
    }
  } catch {
    /* ignore */
  }
  return isPasswordRecoveryPending();
}

// Capture before createClient / Strict Mode can wipe the query string.
capturePasswordRecoveryFromUrl();
