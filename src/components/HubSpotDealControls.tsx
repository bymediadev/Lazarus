import { useCallback, useEffect, useState } from "react";
import {
  disconnectHubSpot,
  fetchHubSpotStatus,
  hubspotConnectUrl,
  importHubSpotDealNotes,
  searchHubSpotDeals,
  type HubSpotDealHit,
  type HubSpotProviderStatus,
} from "../lib/hubspotIntegration";
import type { HistoricalCrmContextEntry } from "../types";

export interface HubSpotImportPayload {
  accountId: string;
  salesCycleDays: string;
  historicalCrmContext: HistoricalCrmContextEntry[];
}

interface Props {
  onImport: (payload: HubSpotImportPayload, notice: string) => void;
  onError: (message: string) => void;
}

export default function HubSpotDealControls({ onImport, onError }: Props) {
  const [status, setStatus] = useState<HubSpotProviderStatus | null>(null);
  const [busy, setBusy] = useState<"search" | "import" | "disconnect" | null>(null);
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<HubSpotDealHit[]>([]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchHubSpotStatus();
      setStatus(next);
      setStatusError(null);
    } catch {
      setStatusError("HubSpot status unavailable. Check the API connection and try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onOAuthComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string }>).detail;
      if (detail?.provider && detail.provider !== "hubspot") return;
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

  const openOAuthPopup = () => {
    const popup = window.open(
      hubspotConnectUrl(),
      "lazarus-hubspot-oauth",
      "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
    );
    if (!popup) {
      onError("Allow popups to connect HubSpot.");
      return;
    }
    popup.focus();
  };

  const runSearch = async () => {
    if (query.trim().length < 2) {
      onError("Enter a deal name (at least 2 characters).");
      return;
    }
    setBusy("search");
    try {
      const result = await searchHubSpotDeals(query);
      setDeals(result.deals);
      setLastQuery(result.query);
      if (!result.deals.length) {
        onError(`No HubSpot deals matched “${result.query}”.`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "HubSpot deal search failed.");
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (deal: HubSpotDealHit) => {
    setBusy("import");
    try {
      const result = await importHubSpotDealNotes(deal.id);
      onImport(
        {
          accountId: result.account_id,
          salesCycleDays: String(result.sales_cycle_days),
          historicalCrmContext: result.historical_crm_context,
        },
        `Imported ${result.note_count} note${result.note_count === 1 ? "" : "s"} from “${result.deal.dealname}” into Deal Profile.`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "HubSpot import failed.");
    } finally {
      setBusy(null);
    }
  };

  const runDisconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnectHubSpot();
      setDeals([]);
      setLastQuery(null);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setBusy(null);
    }
  };

  if (status && !status.configured) {
    return (
      <div className="hubspot-deal-controls hubspot-deal-controls--muted" aria-label="HubSpot">
        <span className="hubspot-deal-kicker">HubSpot</span>
        <p>Not configured — add HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET to enable read-only import.</p>
      </div>
    );
  }

  return (
    <div className="hubspot-deal-controls" aria-label="HubSpot deal import">
      <div className="hubspot-deal-head">
        <div>
          <span className="hubspot-deal-kicker">HubSpot</span>
          <span className={`email-provider-status ${status?.connected ? "is-connected" : ""}`}>
            {!status
              ? "…"
              : status.connected
                ? status.account_email || status.hub_domain || "Connected"
                : "Disconnected"}
          </span>
        </div>
        <div className="hubspot-deal-actions">
          {status?.configured && !status.connected && (
            <button type="button" className="btn-secondary email-provider-btn" onClick={openOAuthPopup}>
              Connect HubSpot
            </button>
          )}
          {status?.connected && (
            <button
              type="button"
              className="file-clear-btn"
              disabled={busy !== null}
              onClick={() => void runDisconnect()}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {statusError && (
        <div className="mailbox-status-error" role="alert">
          <span>{statusError}</span>
          <button type="button" className="file-clear-btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {status?.connected && (
        <>
          <p className="hubspot-deal-hint">
            Search deals and import associated notes into account ID, sales cycle, and historical CRM
            JSON (read-only).
          </p>
          <div className="mailbox-query-row hubspot-deal-search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search HubSpot deals by name…"
              aria-label="HubSpot deal search"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void runSearch();
              }}
            />
            <button
              type="button"
              className="btn-primary mailbox-search-btn"
              disabled={busy !== null || query.trim().length < 2}
              onClick={() => void runSearch()}
            >
              {busy === "search" ? "Searching…" : "Search"}
            </button>
          </div>

          {lastQuery != null && (
            <ul className="hubspot-deal-list" aria-live="polite">
              {deals.length === 0 ? (
                <li className="hubspot-deal-empty">No deals for “{lastQuery}”.</li>
              ) : (
                deals.map((deal) => (
                  <li key={deal.id}>
                    <div>
                      <strong>{deal.dealname}</strong>
                      <span>
                        {deal.dealstage || "no stage"}
                        {deal.amount ? ` · ${deal.amount}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary email-provider-btn"
                      disabled={busy !== null}
                      onClick={() => void runImport(deal)}
                    >
                      {busy === "import" ? "Importing…" : "Import notes"}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
