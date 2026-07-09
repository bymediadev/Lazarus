import type { HistoricalCrmContextEntry } from "../types";
import { normalizeVetoHolders } from "../../shared/deepContextTypes";
import { demoDeepContext } from "../lib/demoDeepContext";

interface Props {
  accountId: string;
  salesCycleDays: string;
  historicalJson: string;
  onAccountIdChange: (value: string) => void;
  onSalesCycleDaysChange: (value: string) => void;
  onHistoricalJsonChange: (value: string) => void;
  onParseError: (message: string | null) => void;
}

export function parseHistoricalCrmJson(raw: string): HistoricalCrmContextEntry[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;

    return parsed
      .map((entry) => {
        const o = entry as Record<string, unknown>;

        return {
          date: String(o.date ?? "").trim(),
          stage: String(o.stage ?? "").trim(),
          past_identified_veto_holders: normalizeVetoHolders(o.past_identified_veto_holders),
          past_logged_objections: Array.isArray(o.past_logged_objections)
            ? o.past_logged_objections.map(String).filter(Boolean)
            : [],
        };
      })
      .filter(
        (e) =>
          e.date ||
          e.stage ||
          e.past_identified_veto_holders.length ||
          e.past_logged_objections.length
      );
  } catch {
    return null;
  }
}

export default function DealProfilePanel({
  accountId,
  salesCycleDays,
  historicalJson,
  onAccountIdChange,
  onSalesCycleDaysChange,
  onHistoricalJsonChange,
  onParseError,
}: Props) {
  const loadDemoHistory = () => {
    onAccountIdChange(demoDeepContext.account_id);
    onSalesCycleDaysChange(String(demoDeepContext.sales_cycle_days));
    onHistoricalJsonChange(JSON.stringify(demoDeepContext.historical_crm_context, null, 2));
    onParseError(null);
  };

  const handleHistoricalChange = (value: string) => {
    onHistoricalJsonChange(value);
    if (!value.trim()) {
      onParseError(null);
      return;
    }
    const parsed = parseHistoricalCrmJson(value);
    onParseError(parsed === null ? "Historical CRM JSON must be a valid array." : null);
  };

  return (
    <details className="deal-profile-panel">
      <summary>Deal profile (optional — historical CRM context)</summary>
      <p className="console-tab-hint">
        Account ID and prior-stage objections help Lazarus cross-reference live dialogue with deal
        history. Paste a JSON array or load the demo fixture.
      </p>
      <div className="input-group">
        <label htmlFor="account-id">Account ID</label>
        <input
          id="account-id"
          type="text"
          value={accountId}
          onChange={(e) => onAccountIdChange(e.target.value)}
          placeholder="acme-corp-2026"
        />
      </div>
      <div className="input-group">
        <label htmlFor="sales-cycle-days">Sales cycle length (days)</label>
        <input
          id="sales-cycle-days"
          type="number"
          min="0"
          value={salesCycleDays}
          onChange={(e) => onSalesCycleDaysChange(e.target.value)}
          placeholder="186"
        />
      </div>
      <div className="input-group">
        <div className="deal-profile-json-header">
          <label htmlFor="historical-crm-json">Historical CRM context (JSON array)</label>
          <button type="button" className="file-clear-btn" onClick={loadDemoHistory}>
            Load demo history
          </button>
        </div>
        <textarea
          id="historical-crm-json"
          className="transcript-textarea deal-profile-json"
          value={historicalJson}
          onChange={(e) => handleHistoricalChange(e.target.value)}
          placeholder={'[\n  { "date": "2026-01-14", "stage": "Discovery", ... }\n]'}
          rows={6}
        />
      </div>
    </details>
  );
}
