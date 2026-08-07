import { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
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
        <p className="login-sub">Sign in to save analyses to your account and sync CRM deals.</p>

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
              await auth.signInEmail(email);
              setNotice("Check your email for the magic link.");
            })
          }
        >
          {busy === "email" ? "Sending…" : "Continue with email"}
        </button>

        <div className="login-divider">or</div>

        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() => void run("google", () => auth.signInGoogle())}
        >
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() =>
            void run("hubspot", async () => {
              await auth.connectAndSignInCrm("hubspot");
              setNotice("Finish HubSpot connect in the popup, then click Complete HubSpot sign-in.");
            })
          }
        >
          Continue with HubSpot
        </button>
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() =>
            void run("hubspot-complete", () => auth.completeCrmSignIn("hubspot"))
          }
        >
          {busy === "hubspot-complete" ? "Signing in…" : "Complete HubSpot sign-in"}
        </button>
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() =>
            void run("salesforce", async () => {
              await auth.connectAndSignInCrm("salesforce");
              setNotice(
                "Finish Salesforce connect in the popup, then click Complete Salesforce sign-in."
              );
            })
          }
        >
          Continue with Salesforce
        </button>
        <button
          type="button"
          className="btn-secondary login-oauth"
          disabled={!!busy}
          onClick={() =>
            void run("sf-complete", () => auth.completeCrmSignIn("salesforce"))
          }
        >
          {busy === "sf-complete" ? "Signing in…" : "Complete Salesforce sign-in"}
        </button>

        {notice && <p className="demo-transcript-notice">{notice}</p>}
        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
