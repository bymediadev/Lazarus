import { useCallback, useEffect, useMemo, useState } from "react";
import {
  disconnectHubSpot,
  fetchHubSpotStatus,
  hubspotConnectUrl,
  importHubSpotDealNotes,
  listHubSpotDeals,
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

function dealOptionLabel(deal: HubSpotDealHit): string {
  const stage = deal.dealstage || "no stage";
  const amount = deal.amount ? ` · ${deal.amount}` : "";
  return `${deal.dealname} — ${stage}${amount}`;
}

export default function HubSpotDealControls({ onImport, onError }: Props) {
  const [status, setStatus] = useState<HubSpotProviderStatus | null>(null);
  const [busy, setBusy] = useState<"load" | "import" | "disconnect" | null>(null);
  const [filter, setFilter] = useState("");
  const [deals, setDeals] = useState<HubSpotDealHit[]>([]);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [importedDealId, setImportedDealId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchHubSpotStatus();
      setStatus(next);
      setStatusError(null);
      return next;
    } catch {
      setStatusError("HubSpot status unavailable. Check the API connection and try again.");
      return null;
    }
  }, []);

  const loadDeals = useCallback(
    async (query?: string) => {
      setBusy("load");
      try {
        const q = (query ?? "").trim();
        const result = q.length >= 2 ? await searchHubSpotDeals(q) : await listHubSpotDeals(25);
        setDeals(result.deals);
        setSelectedDealId((prev) => {
          if (prev && result.deals.some((d) => d.id === prev)) return prev;
          return result.deals[0]?.id ?? "";
        });
        if (!result.deals.length) {
          onError(
            q.length >= 2
              ? `No HubSpot deals matched “${q}”.`
              : "No recent HubSpot deals found. Create a deal in HubSpot, then refresh."
          );
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "HubSpot deal list failed.");
      } finally {
        setBusy(null);
      }
    },
    [onError]
  );

  useEffect(() => {
    void (async () => {
      const next = await refresh();
      if (next?.connected) void loadDeals();
    })();

    const onOAuthComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string; outcome?: string }>).detail;
      if (detail?.provider && detail.provider !== "hubspot") return;
      void (async () => {
        const next = await refresh();
        if (next?.connected) void loadDeals();
      })();
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
  }, [refresh, loadDeals]);

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

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) ?? null,
    [deals, selectedDealId]
  );

  const runImport = async () => {
    if (!selectedDeal) {
      onError("Choose a HubSpot deal from the dropdown.");
      return;
    }
    setBusy("import");
    try {
      const result = await importHubSpotDealNotes(selectedDeal.id);
      setImportedDealId(selectedDeal.id);
      onImport(
        {
          accountId: result.account_id,
          salesCycleDays: String(result.sales_cycle_days),
          historicalCrmContext: result.historical_crm_context,
        },
        `Added “${result.deal.dealname}” as CRM context (${result.note_count} note${result.note_count === 1 ? "" : "s"}).`
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
      setSelectedDealId("");
      setImportedDealId(null);
      setFilter("");
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
        <div className="hubspot-deal-picker">
          <p className="hubspot-deal-hint">
            Pick a deal from your CRM, then add it as analysis context (notes + stage history).
          </p>

          <div className="hubspot-deal-filter-row">
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter deals by name…"
              aria-label="Filter HubSpot deals"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void loadDeals(filter);
              }}
            />
            <button
              type="button"
              className="btn-secondary email-provider-btn"
              disabled={busy !== null}
              onClick={() => void loadDeals(filter)}
            >
              {busy === "load" ? "Loading…" : "Refresh"}
            </button>
          </div>

          <label className="hubspot-deal-select-label" htmlFor="hubspot-deal-select">
            Deal
          </label>
          <select
            id="hubspot-deal-select"
            className="hubspot-deal-select"
            value={selectedDealId}
            disabled={busy !== null || deals.length === 0}
            onChange={(event) => setSelectedDealId(event.target.value)}
            aria-label="Select HubSpot deal"
          >
            {deals.length === 0 ? (
              <option value="">No deals loaded</option>
            ) : (
              deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {dealOptionLabel(deal)}
                </option>
              ))
            )}
          </select>

          <div className="hubspot-deal-picker-actions">
            <button
              type="button"
              className="btn-primary mailbox-search-btn"
              disabled={busy !== null || !selectedDeal}
              onClick={() => void runImport()}
            >
              {busy === "import" ? "Adding…" : "Add deal as context"}
            </button>
            {importedDealId && selectedDealId === importedDealId && (
              <span className="hubspot-deal-added">Added to Deal Profile</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
