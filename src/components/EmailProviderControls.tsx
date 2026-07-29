import { useCallback, useEffect, useState } from "react";
import {
  disconnectGmail,
  disconnectOutlook,
  fetchGmailStatus,
  fetchOutlookStatus,
  gmailConnectUrl,
  outlookConnectUrl,
  searchGmailEmails,
  searchOutlookEmails,
  type EmailImportResult,
  type EmailProviderStatus,
} from "../lib/emailProviders";

interface Props {
  onImportThread: (thread: string, notice: string) => void;
  onError: (message: string) => void;
  hasEmailEvidence: boolean;
  onClearEmailEvidence: () => void;
}

export default function EmailProviderControls({
  onImportThread,
  onError,
  hasEmailEvidence,
  onClearEmailEvidence,
}: Props) {
  const [gmail, setGmail] = useState<EmailProviderStatus | null>(null);
  const [outlook, setOutlook] = useState<EmailProviderStatus | null>(null);
  const [busy, setBusy] = useState<"gmail" | "outlook" | null>(null);
  const [request, setRequest] = useState("");
  const [lastResult, setLastResult] = useState<EmailImportResult | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const anyConnected = !!(gmail?.connected || outlook?.connected);

  const refresh = useCallback(async () => {
    try {
      const [g, o] = await Promise.all([fetchGmailStatus(), fetchOutlookStatus()]);
      setGmail(g);
      setOutlook(o);
      setStatusError(null);
    } catch {
      setStatusError("Mailbox status is unavailable. Check the API connection and try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onOAuthComplete = () => {
      void refresh();
    };
    const onWindowFocus = () => {
      void refresh();
    };
    window.addEventListener("lazarus-oauth-complete", onOAuthComplete);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("lazarus-oauth-complete", onOAuthComplete);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [refresh]);

  const openOAuthPopup = (provider: "gmail" | "outlook") => {
    const url = provider === "gmail" ? gmailConnectUrl() : outlookConnectUrl();
    const popup = window.open(
      url,
      `lazarus-${provider}-oauth`,
      "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      onError(`Allow popups to connect ${provider === "gmail" ? "Gmail" : "Outlook"}.`);
      return;
    }
    popup.focus();
  };

  const runSearch = async (provider: "gmail" | "outlook") => {
    if (!request.trim()) {
      onError("Ask for a company, domain, person, or topic to search.");
      return;
    }
    setBusy(provider);
    try {
      const result =
        provider === "gmail"
          ? await searchGmailEmails(request)
          : await searchOutlookEmails(request);
      if (!result.thread.trim()) {
        onError(
          `No matching ${provider === "gmail" ? "Gmail" : "Outlook"} threads found for “${result.query ?? request}”.`
        );
        return;
      }
      setLastResult(result);
      const threadLabel =
        result.thread_count && result.thread_count > 0
          ? `${result.thread_count} thread${result.thread_count === 1 ? "" : "s"}`
          : `${result.count} message${result.count === 1 ? "" : "s"}`;
      onImportThread(
        result.thread,
        `Attached ${threadLabel} (${result.count} message${result.count === 1 ? "" : "s"}) from ${provider === "gmail" ? "Gmail" : "Outlook"} for “${result.query ?? request}”. Add a call, PDF, or HubSpot notes, then analyze together.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Mailbox search failed.");
    } finally {
      setBusy(null);
    }
  };

  const runDisconnect = async (provider: "gmail" | "outlook") => {
    setBusy(provider);
    try {
      if (provider === "gmail") await disconnectGmail();
      else await disconnectOutlook();
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setBusy(null);
    }
  };

  const preferredProvider: "gmail" | "outlook" | null = gmail?.connected
    ? "gmail"
    : outlook?.connected
      ? "outlook"
      : null;

  return (
    <div className="email-provider-controls" aria-label="Email providers">
      <div className="mailbox-query-hero">
        <span className="mailbox-query-kicker">Ask your mailbox</span>
        <h3>Find a deal thread</h3>
        <div className="mailbox-query-row">
          <input
            type="search"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Pull up the Spec Kitty thread..."
            aria-label="Mailbox question"
            disabled={!anyConnected}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !preferredProvider) return;
              event.preventDefault();
              void runSearch(preferredProvider);
            }}
          />
          {gmail?.connected && (
            <button
              type="button"
              className="btn-primary mailbox-search-btn"
              disabled={busy !== null || !request.trim()}
              onClick={() => void runSearch("gmail")}
            >
              {busy === "gmail" ? "Searching…" : "Search Gmail"}
            </button>
          )}
          {outlook?.connected && (
            <button
              type="button"
              className={`mailbox-search-btn ${gmail?.connected ? "btn-secondary" : "btn-primary"}`}
              disabled={busy !== null || !request.trim()}
              onClick={() => void runSearch("outlook")}
            >
              {busy === "outlook" ? "Searching…" : "Search Outlook"}
            </button>
          )}
        </div>
        {!anyConnected && (
          <p className="mailbox-connect-prompt">
            Connect a mailbox to search full conversations.
          </p>
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

      <div className="email-provider-grid">
        <div className="email-provider-card">
          <div className="email-provider-head">
            <strong>Gmail</strong>
            <span className={`email-provider-status ${gmail?.connected ? "is-connected" : ""}`}>
              {!gmail
                ? "…"
                : !gmail.configured
                  ? "Not configured"
                  : gmail.connected
                    ? gmail.account_email || "Connected"
                    : "Disconnected"}
            </span>
          </div>
          <div className="email-provider-actions">
            {gmail?.configured && !gmail.connected && (
              <button
                type="button"
                className="btn-secondary email-provider-btn"
                onClick={() => openOAuthPopup("gmail")}
              >
                Connect Gmail
              </button>
            )}
            {gmail?.connected && (
              <button
                type="button"
                className="file-clear-btn"
                disabled={busy !== null}
                onClick={() => void runDisconnect("gmail")}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div className="email-provider-card">
          <div className="email-provider-head">
            <strong>Outlook</strong>
            <span className={`email-provider-status ${outlook?.connected ? "is-connected" : ""}`}>
              {!outlook
                ? "…"
                : !outlook.configured
                  ? "Not configured"
                  : outlook.connected
                    ? outlook.account_email || "Connected"
                    : "Disconnected"}
            </span>
          </div>
          <div className="email-provider-actions">
            {outlook?.configured && !outlook.connected && (
              <button
                type="button"
                className="btn-secondary email-provider-btn"
                onClick={() => openOAuthPopup("outlook")}
              >
                Connect Outlook
              </button>
            )}
            {outlook?.connected && (
              <button
                type="button"
                className="file-clear-btn"
                disabled={busy !== null}
                onClick={() => void runDisconnect("outlook")}
              >
                Disconnect
              </button>
            )}
            {!outlook?.configured && (
              <span className="email-provider-hint">Add Azure TEAMS_CLIENT_ID / SECRET in .env</span>
            )}
          </div>
        </div>
      </div>

      {lastResult && (
        <section className="mailbox-results" aria-live="polite">
          <div className="mailbox-results-head">
            <div>
              <strong>
                {lastResult.thread_count
                  ? `${lastResult.thread_count} thread${lastResult.thread_count === 1 ? "" : "s"} · ${lastResult.count} message${lastResult.count === 1 ? "" : "s"} attached`
                  : `${lastResult.count} matching message${lastResult.count === 1 ? "" : "s"} attached`}
              </strong>
              <span>
                {lastResult.provider === "gmail" ? "Gmail" : "Outlook"} search: “
                {lastResult.query}”
              </span>
            </div>
            {hasEmailEvidence && (
              <button
                type="button"
                className="file-clear-btn"
                onClick={() => {
                  onClearEmailEvidence();
                  setLastResult(null);
                }}
              >
                Clear email evidence
              </button>
            )}
          </div>
          <ul className="mailbox-result-list">
            {lastResult.messages.slice(0, 5).map((message) => (
              <li key={message.id}>
                <strong>{message.subject || "(no subject)"}</strong>
                <span>{message.from || "Unknown sender"}</span>
                <p>{message.snippet || "Message content attached."}</p>
              </li>
            ))}
          </ul>
          {lastResult.messages.length > 5 && (
            <p className="mailbox-results-more">
              + {lastResult.messages.length - 5} more messages included from expanded threads
            </p>
          )}
        </section>
      )}
    </div>
  );
}
