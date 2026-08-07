import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthStatus } from "../lib/auth";
import { fetchGoogleMeetStatus } from "../lib/googleMeetIntegration";
import { subscribeOAuthComplete } from "../lib/oauthBridge";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup" | "reset";
type ProviderId = "google" | "hubspot" | "salesforce";

export default function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{
    google?: boolean;
    hubspot?: boolean;
    salesforce?: boolean;
  }>({});
  const finishingRef = useRef(false);
  const oauthStartedAtRef = useRef<number>(0);

  const finishProviderLogin = useCallback(
    async (provider: ProviderId) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setNotice("Finishing Lazarus sign-in…");
      setBusy(provider);
      setError(null);
      try {
        await auth.completeProviderLogin(provider);
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
    return subscribeOAuthComplete((detail) => {
      if (!detail.provider) return;
      if (detail.outcome === "error") {
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
        const provider = detail.provider as ProviderId;
        if (provider === "google" || provider === "hubspot" || provider === "salesforce") {
          void finishProviderLogin(provider);
        }
      }
    });
  }, [finishProviderLogin]);

  // If Google is already connected (or popup finished without opener), poll and sign in.
  useEffect(() => {
    if (busy !== "google") return;
    const startedAt = oauthStartedAtRef.current || Date.now();
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const status = await fetchGoogleMeetStatus();
          if (!status.connected || !status.account_email) return;
          const connectedAt = status.connected_at
            ? new Date(status.connected_at).getTime()
            : 0;
          // Fresh OAuth during this attempt (allow small clock skew).
          if (connectedAt >= startedAt - 15_000) {
            await finishProviderLogin("google");
          }
        } catch {
          /* keep waiting */
        }
      })();
    }, 1200);
    return () => window.clearInterval(id);
  }, [busy, finishProviderLogin]);

  useEffect(() => {
    if (busy !== "google" && busy !== "hubspot" && busy !== "salesforce") return;
    const id = window.setTimeout(() => {
      if (busy === "google" || busy === "hubspot" || busy === "salesforce") {
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

  const startProvider = async (provider: ProviderId) => {
    setError(null);
    oauthStartedAtRef.current = Date.now();

    if (provider === "google") {
      try {
        const status = await fetchGoogleMeetStatus();
        if (status.connected && status.account_email) {
          setNotice("Google already connected — signing into Lazarus…");
          await finishProviderLogin("google");
          return;
        }
      } catch {
        /* fall through to popup */
      }
    }

    setNotice(
      `Approve ${provider === "google" ? "Google" : provider === "hubspot" ? "HubSpot" : "Salesforce"} in the popup — Lazarus will finish sign-in automatically.`
    );
    setBusy(provider);
    try {
      void auth.startProviderLogin(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not open ${provider} sign-in`);
      setBusy(null);
      setNotice(null);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirm("");
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/logo.png" alt="" className="login-logo" />
        <h1>Lazarus Deal Recovery</h1>
        <p className="login-sub">
          {mode === "signup"
            ? "Create your Lazarus account — email and password are stored securely in your auth database."
            : mode === "reset"
              ? "We’ll email a password reset link if mail delivery is configured."
              : "Sign in to your Lazarus account — save analyses, sync CRM deals, and manage your password."}
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
                setNotice("If that email has an account, a reset link was sent.");
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
            onClick={() => void startProvider("google")}
          >
            {busy === "google" ? "Waiting for Google…" : "Google"}
          </button>
        )}
        {providers.hubspot !== false && (
          <button
            type="button"
            className="btn-secondary login-oauth"
            disabled={!!busy}
            onClick={() => void startProvider("hubspot")}
          >
            {busy === "hubspot" ? "Waiting for HubSpot…" : "HubSpot"}
          </button>
        )}
        {providers.salesforce !== false && (
          <button
            type="button"
            className="btn-secondary login-oauth"
            disabled={!!busy}
            onClick={() => void startProvider("salesforce")}
          >
            {busy === "salesforce" ? "Waiting for Salesforce…" : "Salesforce"}
          </button>
        )}

        {notice && <p className="demo-transcript-notice">{notice}</p>}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
