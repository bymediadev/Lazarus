import { useState } from "react";
import { verifyAuthenticatorCode } from "../lib/mfa";

/** Shown after password sign-in when this account has an authenticator. */
export default function AuthenticatorCodeScreen() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyAuthenticatorCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not match.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <img src="/logo.png" alt="Lazarus Deal Recovery" className="login-logo" />
        <p className="login-sub">
          Enter the 6-digit code from your authenticator app. It changes every 30 seconds.
        </p>
        <label className="login-field">
          <span>Authenticator code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            autoFocus
          />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button
          type="submit"
          className="run-button"
          disabled={busy || code.replace(/\s/g, "").length < 6}
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
