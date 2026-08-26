import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { PricingPlanCards } from "./PricingGate";
import {
  fetchBillingMe,
  formatInvoiceAmount,
  startBillingPortal,
  startCheckout,
  type BillingMe,
  type CheckoutPlan,
} from "../lib/billing";

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
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");

  useEffect(() => {
    if (!open || !auth.session) {
      setBilling(null);
      setDeleteConfirm(false);
      setDeleteTyped("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchBillingMe();
        if (!cancelled) setBilling(next);
      } catch (err) {
        if (!cancelled) {
          setBillingError(err instanceof Error ? err.message : "Could not load billing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, auth.session]);

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

  const onCheckout = async (plan: CheckoutPlan) => {
    setBillingBusy(plan);
    setBillingError(null);
    try {
      await startCheckout(plan);
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Checkout failed");
      setBillingBusy(null);
    }
  };

  const onPortal = async () => {
    setBillingBusy("portal");
    setBillingError(null);
    try {
      await startBillingPortal();
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Could not open billing portal");
      setBillingBusy(null);
    }
  };

  const onDeleteAccount = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await auth.deleteAccount();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
    } finally {
      setBusy(false);
    }
  };

  const showUpgrade =
    !billing ||
    billing.plan === "free" ||
    billing.plan === "ppu" ||
    billing.status === "canceled" ||
    billing.payment_required;

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
          <h3>Billing</h3>
          {billing?.past_due && (
            <div className="warning-banner">
              <p>Payment is past due. Update your card to keep running analyses.</p>
            </div>
          )}
          {billing ? (
            <>
              <p className="account-email">{billing.plan_label}</p>
              <p className="meta-line">Status: {billing.status}</p>
              <p className="meta-line">Analyses: {billing.analyses_remaining_label}</p>
              {billing.period_end && (billing.plan === "entry" || billing.plan === "team") && (
                <p className="meta-line">
                  Next renewal: {new Date(billing.period_end).toLocaleDateString()}
                </p>
              )}
              {billing.invoices.length > 0 && (
                <ul className="billing-invoice-list">
                  {billing.invoices.map((inv) => (
                    <li key={inv.id}>
                      {inv.hosted_invoice_url ? (
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                          {new Date(inv.created).toLocaleDateString()} · {formatInvoiceAmount(inv)} ·{" "}
                          {inv.status}
                        </a>
                      ) : (
                        <span>
                          {new Date(inv.created).toLocaleDateString()} · {formatInvoiceAmount(inv)} ·{" "}
                          {inv.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {billing.can_manage_portal && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!!billingBusy}
                  onClick={() => void onPortal()}
                >
                  {billingBusy === "portal" ? "Opening…" : "Manage billing"}
                </button>
              )}
              {showUpgrade && (
                <PricingPlanCards
                  configured={billing.configured}
                  signedIn
                  busy={billingBusy}
                  onSignIn={() => undefined}
                  onCheckout={(plan) => void onCheckout(plan)}
                />
              )}
              {billing.plan === "entry" && billing.status === "active" && !billing.payment_required && (
                <button
                  type="button"
                  className="run-button"
                  disabled={!!billingBusy || !billing.configured}
                  onClick={() => void onCheckout("team")}
                >
                  {billingBusy === "team" ? "Redirecting…" : "Upgrade to Team · $499/mo unlimited"}
                </button>
              )}
            </>
          ) : (
            <p className="meta-line">Loading billing…</p>
          )}
          {billingError && <div className="error-banner">{billingError}</div>}
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
            <span>Confirm password</span>
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
            Analyses on this account are saved automatically. The <strong>My deals</strong> lifecycle
            tracker (stalled vs unstuck over time) is on Entry ($99/mo) and Team ($499/mo). WhiteWhale
            Why Now signals are on Team.
          </p>
        </section>

        <section className="account-portal-section">
          <h3>Delete account</h3>
          <p className="meta-line">
            Permanently removes this login, saved analyses, and billing records. This cannot be
            undone.
          </p>
          {!deleteConfirm ? (
            <button
              type="button"
              className="btn-secondary account-delete-btn"
              disabled={busy}
              onClick={() => {
                setError(null);
                setNotice(null);
                setDeleteConfirm(true);
              }}
            >
              Delete my account…
            </button>
          ) : (
            <div className="account-delete-confirm">
              <label className="login-field">
                <span>Type DELETE to confirm</span>
                <input
                  type="text"
                  value={deleteTyped}
                  onChange={(e) => setDeleteTyped(e.target.value)}
                  autoComplete="off"
                  placeholder="DELETE"
                />
              </label>
              <div className="account-delete-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setDeleteConfirm(false);
                    setDeleteTyped("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="account-delete-btn"
                  disabled={busy || deleteTyped.trim() !== "DELETE"}
                  onClick={() => void onDeleteAccount()}
                >
                  {busy ? "Deleting…" : "Delete account forever"}
                </button>
              </div>
            </div>
          )}
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
