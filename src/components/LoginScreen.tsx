import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthStatus } from "../lib/auth";
import { subscribeOAuthComplete } from "../lib/oauthBridge";
import { useAuth } from "./AuthProvider";
import { navigateApp } from "../lib/appRoute";
import {
  captureCheckoutSessionFromUrl,
  fetchCheckoutPreview,
} from "../lib/billing";

type Mode = "signin" | "signup" | "reset";
type ProviderId = "google" | "hubspot" | "salesforce";

export type LoginScreenProps = {
  /** When set, render as a dismissible overlay over the product. */
  onClose?: () => void;
  /** Guest path into the workspace (defaults to /portal). */
  onContinueGuest?: () => void;
  initialMode?: Exclude<Mode, "reset">;
};

export default function LoginScreen({
  onClose,
  onContinueGuest,
  initialMode = "signin",
}: LoginScreenProps) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<{
    google?: boolean;
    hubspot?: boolean;
    salesforce?: boolean;
  }>({});
  const finishingRef = useRef(false);
  /** Set when the user clicks a provider, or when /login returns with a login_code. */
  const pendingProviderRef = useRef<ProviderId | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = captureCheckoutSessionFromUrl();
    if (params.get("billing") !== "success" && !sessionId) return;
    setMode("signup");
    if (!sessionId) {
      setBillingNotice("Payment received — create your account to unlock analyses.");
      return;
    }
    void fetchCheckoutPreview(sessionId).then((preview) => {
      if (preview?.email) setEmail(preview.email);
      setBillingNotice(
        preview?.paid
          ? `Payment received${preview.plan_label ? ` (${preview.plan_label})` : ""}. Create your account to unlock analyses.`
          : "Payment received — create your account to unlock analyses."
      );
    });
  }, []);

  // Close the modal once a session exists (email/password or OAuth finished).
  useEffect(() => {
    if (auth.session && onClose && !auth.passwordRecovery) {
      onClose();
    }
  }, [auth.session, auth.passwordRecovery, onClose]);

  const finishProviderLogin = useCallback(
    async (provider: ProviderId, loginCode?: string | null) => {
      if (finishingRef.current) return;
      if (pendingProviderRef.current !== provider) return;
      finishingRef.current = true;
      pendingProviderRef.current = null;
      setNotice("Finishing Lazarus sign-in…");
      setBusy(provider);
      setError(null);
      try {
        await auth.completeProviderLogin(loginCode);
        setNotice(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
        setNotice(null);
      } finally {
        finishingRef.current = false;
        setBusy(null);
      }
    },
    [auth]
  );

  useEffect(() => {
    void fetchAuthStatus().then((s) => {
      setProviders({
        google: s.google,
        hubspot: s.hubspot,
        salesforce: s.salesforce,
      });
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Popup still has opener: the original tab finishes via BroadcastChannel.
    if (window.opener && !window.opener.closed) return;

    const params = new URLSearchParams(window.location.search);
    const loginCode = params.get("login_code");
    for (const provider of ["google", "hubspot", "salesforce"] as const) {
      const outcome = params.get(provider);
      if (outcome === "error") {
        pendingProviderRef.current = null;
        const reason = params.get("reason") ?? "oauth";
        const friendly =
          provider === "google" && (reason === "tls_certificate" || reason === "token_exchange")
            ? "Google sign-in failed on this machine (TLS). Use email + password, or fix Windows CA certs."
            : `Sign-in failed (${reason}). Try again.`;
        setError(friendly);
        setNotice(null);
        setBusy(null);
        params.delete(provider);
        params.delete("reason");
        params.delete("login_code");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", next);
        return;
      }
      if (outcome === "connected" && loginCode) {
        pendingProviderRef.current = provider;
        params.delete(provider);
        params.delete("login_code");
        params.delete("reason");
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
        window.history.replaceState({}, "", next);
        void finishProviderLogin(provider, loginCode);
        return;
      }
    }
  }, [finishProviderLogin]);

  useEffect(() => {
    return subscribeOAuthComplete((detail) => {
      if (!detail.provider) return;
      const provider = detail.provider as ProviderId;
      if (provider !== "google" && provider !== "hubspot" && provider !== "salesforce") {
        return;
      }
      if (pendingProviderRef.current !== provider) return;

      if (detail.outcome === "error") {
        pendingProviderRef.current = null;
        const reason = detail.reason ?? "oauth";
        const friendly =
          reason === "tls_certificate" || reason === "token_exchange"
            ? "Google sign-in failed on this machine (TLS). Use email + password, or fix Windows CA certs."
            : `Sign-in failed (${reason}). Try again.`;
        setError(friendly);
        setNotice(null);
        setBusy(null);
        return;
      }
      if (detail.outcome === "connected") {
        void finishProviderLogin(provider, detail.loginCode);
      }
    });
  }, [finishProviderLogin]);

  useEffect(() => {
    if (busy !== "google" && busy !== "hubspot" && busy !== "salesforce") return;
    const id = window.setTimeout(() => {
      if (busy === "google" || busy === "hubspot" || busy === "salesforce") {
        pendingProviderRef.current = null;
        setBusy(null);
        setNotice(null);
        setError((prev) => prev ?? "Sign-in popup closed before finishing. Try again.");
      }
    }, 120_000);
    return () => window.clearTimeout(id);
  }, [busy]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const startProvider = (provider: ProviderId) => {
    setError(null);
    pendingProviderRef.current = provider;
    setNotice(
      `Approve ${provider === "google" ? "Google" : provider === "hubspot" ? "HubSpot" : "Salesforce"} in the popup — Lazarus signs you in only after that succeeds.`
    );
    setBusy(provider);
    void auth.startProviderLogin(provider).catch((err) => {
      pendingProviderRef.current = null;
      setError(err instanceof Error ? err.message : `Could not open ${provider} sign-in`);
      setBusy(null);
      setNotice(null);
    });
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirm("");
  };

  const card = (
    <div className="login-card">
      <img src="/logo.png" alt="Lazarus Deal Recovery" className="login-logo" />
      <p className="login-sub">
        {billingNotice
          ? billingNotice
          : mode === "signup"
          ? "Create your Lazarus account — email and password are stored securely in your auth database."
          : mode === "reset"
            ? "We’ll email a password reset link if mail delivery is configured."
            : "Sign in to save analyses. You can keep using Lazarus for demos without an account."}
      </p>

      <div className="login-mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`login-mode-tab${mode === "signin" ? " active" : ""}`}
          aria-selected={mode === "signin"}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          className={`login-mode-tab${mode === "signup" ? " active" : ""}`}
          aria-selected={mode === "signup"}
          onClick={() => switchMode("signup")}
        >
          Create account
        </button>
      </div>

      <label className="login-field">
        <span>Work email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
        />
      </label>

      {mode !== "reset" && (
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
      )}

      {mode === "signup" && (
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
      )}

      {mode === "signin" && (
        <button
          type="button"
          className="run-button"
          disabled={!!busy || !email.trim() || password.length < 8}
          onClick={() =>
            void run("signin", async () => {
              await auth.signInPassword(email, password);
            })
          }
        >
          {busy === "signin" ? "Signing in…" : "Sign in"}
        </button>
      )}

      {mode === "signup" && (
        <button
          type="button"
          className="run-button"
          disabled={!!busy || !email.trim() || password.length < 8}
          onClick={() =>
            void run("signup", async () => {
              if (password !== confirm) {
                throw new Error("Passwords do not match.");
              }
              await auth.signUpPassword(email, password);
              setMode("signin");
              setPassword("");
              setConfirm("");
              setNotice("Check your email to confirm your account, then sign in.");
            })
          }
        >
          {busy === "signup" ? "Creating account…" : "Create account"}
        </button>
      )}

      {mode === "reset" && (
        <button
          type="button"
          className="run-button"
          disabled={!!busy || !email.trim()}
          onClick={() =>
            void run("reset", async () => {
              await auth.resetPasswordEmail(email);
              setNotice("If that email has an account, check the inbox for a reset link.");
            })
          }
        >
          {busy === "reset" ? "Sending…" : "Send reset link"}
        </button>
      )}

      <div className="login-alt-links">
        {mode === "signin" && (
          <button type="button" className="login-text-link" onClick={() => switchMode("reset")}>
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button type="button" className="login-text-link" onClick={() => switchMode("signin")}>
            Back to sign in
          </button>
        )}
      </div>

      <div className="login-divider">or continue with</div>

      {providers.google !== false && (
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() => startProvider("google")}
        >
          {busy === "google" ? "Waiting for Google…" : "Google"}
        </button>
      )}
      {providers.hubspot !== false && (
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() => startProvider("hubspot")}
        >
          {busy === "hubspot" ? "Waiting for HubSpot…" : "HubSpot"}
        </button>
      )}
      {providers.salesforce !== false && (
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() => startProvider("salesforce")}
        >
          {busy === "salesforce" ? "Waiting for Salesforce…" : "Salesforce"}
        </button>
      )}

      {notice && <p className="demo-transcript-notice">{notice}</p>}
      {error && <div className="error-banner">{error}</div>}

      <button
        type="button"
        className="login-text-link login-continue-guest"
        onClick={() => {
          if (onContinueGuest) {
            onContinueGuest();
            return;
          }
          navigateApp("/portal");
        }}
      >
        Continue without an account
      </button>
    </div>
  );

  if (onClose) {
    return (
      <div className="login-modal-overlay" role="dialog" aria-modal="true" aria-label="Sign in">
        <button type="button" className="guide-backdrop" aria-label="Close sign in" onClick={onClose} />
        {card}
      </div>
    );
  }

  return <div className="login-screen">{card}</div>;
}
