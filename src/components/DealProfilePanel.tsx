import type { HistoricalCrmContextEntry } from "../types";
import { normalizeVetoHolders } from "../../shared/deepContextTypes";
import { demoDeepContext } from "../lib/demoDeepContext";
import HubSpotDealControls, { type HubSpotImportPayload } from "./HubSpotDealControls";
import SalesforceDealControls, {
  type SalesforceImportPayload,
} from "./SalesforceDealControls";
import WhiteWhaleControls, { type WhiteWhaleAttachPayload } from "./WhiteWhaleControls";
import type { WhiteWhaleAccountIntel } from "../lib/whitewhaleIntegration";

interface Props {
  accountId: string;
  salesCycleDays: string;
  historicalJson: string;
  whitewhaleIntel: WhiteWhaleAccountIntel | null;
  onAccountIdChange: (value: string) => void;
  onSalesCycleDaysChange: (value: string) => void;
  onHistoricalJsonChange: (value: string) => void;
  onWhitewhaleIntelChange: (intel: WhiteWhaleAccountIntel | null) => void;
  onParseError: (message: string | null) => void;
  onCrmNotice?: (message: string) => void;
  onCrmError?: (message: string) => void;
  onLinkedHubSpotDeal?: (dealId: string | null) => void;
  onLinkedSalesforceOpp?: (oppId: string | null) => void;
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
  whitewhaleIntel,
  onAccountIdChange,
  onSalesCycleDaysChange,
  onHistoricalJsonChange,
  onWhitewhaleIntelChange,
  onParseError,
  onCrmNotice,
  onCrmError,
  onLinkedHubSpotDeal,
  onLinkedSalesforceOpp,
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

  const handleHubSpotImport = (payload: HubSpotImportPayload, notice: string) => {
    onAccountIdChange(payload.accountId);
    onSalesCycleDaysChange(payload.salesCycleDays);
    onHistoricalJsonChange(JSON.stringify(payload.historicalCrmContext, null, 2));
    onLinkedHubSpotDeal?.(payload.dealId);
    onParseError(null);
    onCrmNotice?.(notice);
  };

  const handleSalesforceImport = (payload: SalesforceImportPayload, notice: string) => {
    onAccountIdChange(payload.accountId);
    onSalesCycleDaysChange(payload.salesCycleDays);
    onHistoricalJsonChange(JSON.stringify(payload.historicalCrmContext, null, 2));
    onLinkedSalesforceOpp?.(payload.opportunityId);
    onParseError(null);
    onCrmNotice?.(notice);
  };

  const handleWhiteWhaleAttach = (payload: WhiteWhaleAttachPayload, notice: string) => {
    onWhitewhaleIntelChange(payload.intel);
    if (!accountId.trim()) {
      onAccountIdChange(payload.domain);
    }
    onCrmNotice?.(notice);
  };

  return (
    <details className="deal-profile-panel" data-guide-target="guide-deal-profile">
      <summary>CRM import + deal history (optional)</summary>
      <p className="console-tab-hint">
        Import HubSpot or Salesforce notes, pull WhiteWhale company signals, or paste prior deal
        history. Push updates after analysis are human-confirmed.
      </p>

      <HubSpotDealControls
        onImport={handleHubSpotImport}
        onError={(message) => {
          if (onCrmError) onCrmError(message);
          else onParseError(message);
        }}
      />

      <SalesforceDealControls
        onImport={handleSalesforceImport}
        onError={(message) => {
          if (onCrmError) onCrmError(message);
          else onParseError(message);
        }}
      />

      <WhiteWhaleControls
        attachedDomain={whitewhaleIntel?.domain ?? null}
        onAttach={handleWhiteWhaleAttach}
        onClear={() => onWhitewhaleIntelChange(null)}
        onError={(message) => {
          if (onCrmError) onCrmError(message);
          else onParseError(message);
        }}
      />
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
