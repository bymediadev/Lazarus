import { useCallback, useEffect, useState } from "react";
import {
  fetchWhiteWhaleStatus,
  lookupWhiteWhaleAccount,
  monitorWhiteWhaleAccount,
  type WhiteWhaleAccountIntel,
  type WhiteWhaleProviderStatus,
} from "../lib/whitewhaleIntegration";

export interface WhiteWhaleAttachPayload {
  domain: string;
  intel: WhiteWhaleAccountIntel;
}

interface Props {
  onAttach: (payload: WhiteWhaleAttachPayload, notice: string) => void;
  onClear?: () => void;
  onError: (message: string) => void;
  attachedDomain?: string | null;
}

export default function WhiteWhaleControls({
  onAttach,
  onClear,
  onError,
  attachedDomain,
}: Props) {
  const [status, setStatus] = useState<WhiteWhaleProviderStatus | null>(null);
  const [busy, setBusy] = useState<"lookup" | "monitor" | null>(null);
  const [domain, setDomain] = useState("");
  const [preview, setPreview] = useState<WhiteWhaleAccountIntel | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchWhiteWhaleStatus();
      setStatus(next);
      setStatusError(next.error ?? null);
    } catch {
      setStatusError("WhiteWhale status unavailable. Check the API connection and try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runLookup = async () => {
    if (domain.trim().length < 3) {
      onError("Enter a company domain (e.g. acme.com).");
      return;
    }
    setBusy("lookup");
    setHint(null);
    try {
      const result = await lookupWhiteWhaleAccount(domain);
      setPreview(result.intel);
      setHint(result.note ?? null);
      if (!result.found) {
        onError(result.note ?? `No WhiteWhale data for “${result.domain}”.`);
      }
    } catch (err) {
      setPreview(null);
      onError(err instanceof Error ? err.message : "WhiteWhale lookup failed.");
    } finally {
      setBusy(null);
    }
  };

  const runMonitor = async () => {
    if (domain.trim().length < 3) {
      onError("Enter a company domain (e.g. acme.com).");
      return;
    }
    setBusy("monitor");
    setHint(null);
    try {
      const result = await monitorWhiteWhaleAccount(domain, { activate: false });
      setPreview(result.intel);
      setHint(result.note ?? null);
      if (result.intel) {
        onAttach(
          { domain: result.domain, intel: result.intel },
          result.note ?? `Monitoring “${result.domain}” in WhiteWhale.`
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "WhiteWhale monitor failed.");
    } finally {
      setBusy(null);
    }
  };

  const attachPreview = () => {
    if (!preview) return;
    onAttach(
      { domain: preview.domain, intel: preview },
      `Attached WhiteWhale signals for ${preview.domain} to this deal.`
    );
  };

  if (status && !status.configured) {
    return (
      <div className="hubspot-deal-controls hubspot-deal-controls--muted" aria-label="WhiteWhale">
        <span className="hubspot-deal-kicker">WhiteWhale</span>
        <p>
          Not configured — add WHITE_WHALE_API_KEY and WHITE_WHALE_USER_EMAIL to pull company buying
          signals into deal recovery.
        </p>
      </div>
    );
  }

  return (
    <div className="hubspot-deal-controls" aria-label="WhiteWhale account signals">
      <div className="hubspot-deal-head">
        <div>
          <span className="hubspot-deal-kicker">WhiteWhale</span>
          <span className={`email-provider-status ${status?.ok ? "is-connected" : ""}`}>
            {!status ? "…" : status.ok ? "API ready" : "Configured — check key"}
          </span>
        </div>
        {attachedDomain && (
          <button
            type="button"
            className="file-clear-btn"
            onClick={() => {
              onClear?.();
              setHint(null);
            }}
          >
            Clear attached
          </button>
        )}
      </div>

      {statusError && (
        <div className="mailbox-status-error" role="alert">
          <span>{statusError}</span>
          <button type="button" className="file-clear-btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <p className="hubspot-deal-hint">
        Look up a company domain for buying signals and Why Now context — where the account is going
        and how to move or save the deal. Attaches to analysis as market context (not CRM notes).
      </p>

      <div className="mailbox-query-row hubspot-deal-search">
        <input
          type="search"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="Company domain (acme.com)…"
          aria-label="WhiteWhale company domain"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void runLookup();
          }}
        />
        <button
          type="button"
          className="btn-primary mailbox-search-btn"
          disabled={busy !== null || domain.trim().length < 3}
          onClick={() => void runLookup()}
        >
          {busy === "lookup" ? "Looking up…" : "Lookup"}
        </button>
      </div>

      {attachedDomain && (
        <p className="hubspot-deal-hint">
          Attached for analysis: <strong>{attachedDomain}</strong>
        </p>
      )}

      {hint && !preview && <p className="hubspot-deal-hint">{hint}</p>}

      {preview && (
        <div className="whitewhale-preview" aria-live="polite">
          <div className="hubspot-deal-head">
            <div>
              <strong>{preview.name || preview.domain}</strong>
              <span>
                {preview.scaled_score != null ? `Score ${Math.round(preview.scaled_score)}` : "—"}
                {preview.status ? ` · ${preview.status}` : ""}
                {preview.industry ? ` · ${preview.industry}` : ""}
              </span>
            </div>
            <div className="hubspot-deal-actions">
              <button
                type="button"
                className="btn-secondary email-provider-btn"
                disabled={busy !== null}
                onClick={attachPreview}
              >
                Attach to deal
              </button>
            </div>
          </div>
          {preview.summary && <p className="whitewhale-why-now">{preview.summary}</p>}
          {preview.signal_names.length > 0 && (
            <ul className="whitewhale-signal-list">
              {preview.signal_names.slice(0, 8).map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          {hint && <p className="hubspot-deal-hint">{hint}</p>}
        </div>
      )}

      {!preview && status?.ok && (
        <button
          type="button"
          className="btn-secondary email-provider-btn"
          disabled={busy !== null || domain.trim().length < 3}
          onClick={() => void runMonitor()}
        >
          {busy === "monitor" ? "Adding…" : "Add to WhiteWhale monitoring"}
        </button>
      )}
    </div>
  );
}
