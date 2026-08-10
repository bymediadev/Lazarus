import { useState } from "react";
import { useAuth } from "./AuthProvider";

/** Shown after the user clicks the forgot-password email link. */
export default function PasswordRecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await auth.changePassword(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/logo.png" alt="Lazarus Deal Recovery" className="login-logo" />
        <p className="login-sub">
          Choose a new password for {auth.user?.email ?? "your account"}. You’ll be signed in after
          it saves.
        </p>

        <label className="login-field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            autoFocus
          />
        </label>

        <label className="login-field">
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
          />
        </label>

        <button
          type="button"
          className="run-button"
          disabled={busy || password.length < 8}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save new password"}
        </button>

        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
