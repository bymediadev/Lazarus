import { useState } from "react";
import { useAuth } from "./AuthProvider";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AccountPortal({ open, onClose }: Props) {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const email = auth.user?.email ?? "—";

  const changePassword = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await auth.changePassword(password);
      setPassword("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-portal-overlay" role="dialog" aria-modal="true" aria-label="Account">
      <button type="button" className="guide-backdrop" aria-label="Close account" onClick={onClose} />
      <aside className="account-portal">
        <header className="account-portal-header">
          <div>
            <h2>Account</h2>
            <p>Your Lazarus login is stored in Supabase Auth.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="account-portal-section">
          <h3>Profile</h3>
          <p className="account-email">{email}</p>
          {auth.user?.id && <p className="meta-line">User ID: {auth.user.id}</p>}
        </section>

        <section className="account-portal-section">
          <h3>Change password</h3>
          <label className="login-field">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
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
            className="btn-secondary"
            disabled={busy || password.length < 8}
            onClick={() => void changePassword()}
          >
            {busy ? "Saving…" : "Update password"}
          </button>
          {notice && <p className="demo-transcript-notice">{notice}</p>}
          {error && <div className="error-banner">{error}</div>}
        </section>

        <section className="account-portal-section">
          <h3>Saved deals</h3>
          <p className="meta-line">
            Use <strong>My deals</strong> in the header for past runs, CRM links, and lifecycle
            (stalled vs getting unstuck).
          </p>
        </section>

        <section className="account-portal-section">
          <button
            type="button"
            className="run-button"
            onClick={() => {
              void auth.logout();
              onClose();
            }}
          >
            Sign out
          </button>
        </section>
      </aside>
    </div>
  );
}
