import { useCallback, useEffect, useState } from "react";
import {
  disconnectSalesforce,
  fetchSalesforceStatus,
  importSalesforceOpportunity,
  searchSalesforceOpportunities,
  type SalesforceOppHit,
  type SalesforceProviderStatus,
} from "../lib/salesforceIntegration";
import { startLoggedInOAuthConnect } from "../lib/oauthConnect";
import type { HistoricalCrmContextEntry } from "../types";

export interface SalesforceImportPayload {
  accountId: string;
  salesCycleDays: string;
  historicalCrmContext: HistoricalCrmContextEntry[];
  opportunityId: string;
}

interface Props {
  onImport: (payload: SalesforceImportPayload, notice: string) => void;
  onError: (message: string) => void;
}

export default function SalesforceDealControls({ onImport, onError }: Props) {
  const [status, setStatus] = useState<SalesforceProviderStatus | null>(null);
  const [busy, setBusy] = useState<"search" | "import" | "disconnect" | null>(null);
  const [query, setQuery] = useState("");
  const [opps, setOpps] = useState<SalesforceOppHit[]>([]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchSalesforceStatus());
    } catch {
      /* status optional */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onOAuth = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: string }>).detail;
      if (detail?.provider && detail.provider !== "salesforce") return;
      void refresh();
    };
    window.addEventListener("lazarus-oauth-complete", onOAuth);
    window.addEventListener("focus", () => void refresh());
    return () => {
      window.removeEventListener("lazarus-oauth-complete", onOAuth);
    };
  }, [refresh]);

  if (!status?.configured) return null;

  return (
    <div className="hubspot-controls salesforce-controls">
      <div className="hubspot-controls-header">
        <strong>Salesforce</strong>
        {status.connected ? (
          <span className="meta-line">
            Connected{status.account_email ? ` · ${status.account_email}` : ""}
          </span>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void startLoggedInOAuthConnect("salesforce").catch((err) => {
                onError(err instanceof Error ? err.message : "Allow popups to connect Salesforce.");
              });
            }}
          >
            Connect Salesforce
          </button>
        )}
      </div>

      {status.connected && (
        <>
          <div className="hubspot-search-row">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search opportunities…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void (async () => {
                    setBusy("search");
                    try {
                      const result = await searchSalesforceOpportunities(query);
                      setOpps(result.opportunities);
                      if (!result.opportunities.length) {
                        onError(`No opportunities matched “${result.query}”.`);
                      }
                    } catch (err) {
                      onError(err instanceof Error ? err.message : "Search failed");
                    } finally {
                      setBusy(null);
                    }
                  })();
                }
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy("search");
                  try {
                    const result = await searchSalesforceOpportunities(query);
                    setOpps(result.opportunities);
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Search failed");
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              {busy === "search" ? "…" : "Search"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy("disconnect");
                  try {
                    await disconnectSalesforce();
                    setOpps([]);
                    await refresh();
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Disconnect failed");
                  } finally {
                    setBusy(null);
                  }
                })();
              }}
            >
              Disconnect
            </button>
          </div>
          {opps.length > 0 && (
            <ul className="hubspot-deal-list">
              {opps.map((opp) => (
                <li key={opp.id}>
                  <div>
                    <strong>{opp.name}</strong>
                    <span className="meta-line">
                      {opp.stageName}
                      {opp.amount != null ? ` · $${opp.amount}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy !== null}
                    onClick={() => {
                      void (async () => {
                        setBusy("import");
                        try {
                          const result = await importSalesforceOpportunity(opp.id);
                          onImport(
                            {
                              accountId: result.account_id,
                              salesCycleDays: String(result.sales_cycle_days),
                              historicalCrmContext: result.historical_crm_context,
                              opportunityId: result.deal_id,
                            },
                            `Imported ${result.note_count} Salesforce note(s) from “${opp.name}”.`
                          );
                        } catch (err) {
                          onError(err instanceof Error ? err.message : "Import failed");
                        } finally {
                          setBusy(null);
                        }
                      })();
                    }}
                  >
                    Import
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
