import { useState } from "react";
import { generateCompanyApiKey } from "../lib/companyKey";

export default function ApiKeyGenerator() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreateKey = async () => {
    setLoading(true);
    setApiKey(null);
    setNotice(null);
    setError(null);
    setCopied(false);
    try {
      const created = await generateCompanyApiKey();
      setApiKey(created.rawKey);
      setNotice(created.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a company key");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      setError("Could not copy the key. Select it and copy it manually.");
    }
  };

  return (
    <section className="account-portal-section">
      <h3>Company API key</h3>
      <p className="meta-line">
        Your server sends a deal in with this key. The transcript stays on your side. Lazarus returns
        the report. A new key replaces the previous one.
      </p>

      {!apiKey ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void handleCreateKey()}
          disabled={loading}
        >
          {loading ? "Creating key…" : "Generate company key"}
        </button>
      ) : (
        <div className="api-key-reveal">
          <p className="api-key-warn">
            {notice ?? "Copy this key now. We store only a hash, so it will not be shown again."}
          </p>
          <div className="api-key-value">
            <code>{apiKey}</code>
            <button type="button" className="btn-secondary" onClick={() => void copyToClipboard()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            className="api-key-done"
            onClick={() => {
              setApiKey(null);
              setNotice(null);
              setCopied(false);
            }}
          >
            Done
          </button>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </section>
  );
}
