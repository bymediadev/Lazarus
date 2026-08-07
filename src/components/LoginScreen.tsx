import { useEffect, useState } from "react";
import { fetchAuthStatus } from "../lib/auth";
import { useAuth } from "./AuthProvider";

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{
    google?: boolean;
    hubspot?: boolean;
    salesforce?: boolean;
  }>({});

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
    const onOAuth = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string; outcome?: string; reason?: string }>)
        .detail;
      if (!detail?.provider) return;
      if (detail.outcome === "error") {
        setError(`Sign-in failed (${detail.reason ?? "oauth"}). Try again.`);
        setBusy(null);
        return;
      }
      if (detail.outcome === "connected") {
        setNotice("Finishing Lazarus sign-in…");
        setBusy(detail.provider);
        void auth
          .completeProviderLogin(detail.provider as "google" | "hubspot" | "salesforce")
          .then(() => {
            setNotice(null);
            setBusy(null);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Sign-in failed");
            setBusy(null);
          });
      }
    };
    window.addEventListener("lazarus-oauth-complete", onOAuth);
    return () => window.removeEventListener("lazarus-oauth-complete", onOAuth);
  }, [auth]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    setDevLink(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/logo.png" alt="" className="login-logo" />
        <h1>Lazarus Deal Recovery</h1>
        <p className="login-sub">
          Sign in to your Lazarus account — save analyses, sync CRM deals, and pick up where you left
          off.
        </p>

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
        <button
          type="button"
          className="run-button"
          disabled={!!busy || !email.trim()}
          onClick={() =>
            void run("email", async () => {
              const result = await auth.signInEmail(email);
              setNotice(result.message);
              if (result.action_link) setDevLink(result.action_link);
            })
          }
        >
          {busy === "email" ? "Sending…" : "Continue with email"}
        </button>

        <div className="login-divider">or</div>

        {providers.google !== false && (
          <button
            type="button"
            className="btn-secondary login-oauth"
            disabled={!!busy}
            onClick={() => {
              setError(null);
              setNotice("Approve Google in the popup — Lazarus will finish sign-in automatically.");
              setBusy("google");
              try {
                void auth.startProviderLogin("google");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not open Google sign-in");
                setBusy(null);
              }
            }}
          >
            {busy === "google" ? "Waiting for Google…" : "Continue with Google"}
          </button>
        )}
        {providers.hubspot !== false && (
          <button
            type="button"
            className="btn-secondary login-oauth"
            disabled={!!busy}
            onClick={() => {
              setError(null);
              setNotice("Approve HubSpot in the popup — Lazarus will finish sign-in automatically.");
              setBusy("hubspot");
              try {
                void auth.startProviderLogin("hubspot");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not open HubSpot sign-in");
                setBusy(null);
              }
            }}
          >
            {busy === "hubspot" ? "Waiting for HubSpot…" : "Continue with HubSpot"}
          </button>
        )}
        {providers.salesforce !== false && (
          <button
            type="button"
            className="btn-secondary login-oauth"
            disabled={!!busy}
            onClick={() => {
              setError(null);
              setNotice(
                "Approve Salesforce in the popup — Lazarus will finish sign-in automatically."
              );
              setBusy("salesforce");
              try {
                void auth.startProviderLogin("salesforce");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not open Salesforce sign-in");
                setBusy(null);
              }
            }}
          >
            {busy === "salesforce" ? "Waiting for Salesforce…" : "Continue with Salesforce"}
          </button>
        )}

        {notice && <p className="demo-transcript-notice">{notice}</p>}
        {devLink && (
          <p className="demo-transcript-notice">
            Local sign-in link:{" "}
            <a href={devLink} target="_blank" rel="noreferrer">
              Open Lazarus session
            </a>
          </p>
        )}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
