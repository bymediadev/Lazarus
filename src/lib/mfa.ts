import { getSupabaseBrowserClient } from "./auth";

/** Password sign-in is aal1. A verified authenticator must be checked before Founder Ops. */
export async function authenticatorStepUpRequired(): Promise<boolean> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return false;
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel !== "aal2" && data.nextLevel === "aal2";
}

export async function verifyAuthenticatorCode(code: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Sign-in is not configured.");
  const trimmed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(trimmed)) {
    throw new Error("Enter the 6-digit code from your authenticator app.");
  }

  const { data: factors, error: listError } = await sb.auth.mfa.listFactors();
  if (listError) throw listError;
  const factor = factors?.totp?.find((item) => item.status === "verified");
  if (!factor) throw new Error("No authenticator is enrolled on this account.");

  const { data: challenge, error: challengeError } = await sb.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    throw challengeError ?? new Error("Could not check that code.");
  }

  const { error: verifyError } = await sb.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: trimmed,
  });
  if (!verifyError) return;
  const message = verifyError.message.toLowerCase();
  if (message.includes("invalid") || message.includes("expired")) {
    throw new Error("That code did not match. Enter the current 6-digit code.");
  }
  throw verifyError;
}
