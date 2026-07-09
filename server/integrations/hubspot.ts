import {
  type HistoricalCrmContextEntry,
  normalizeVetoHolders,
} from "../../shared/deepContextTypes.js";
import { MAX_SALES_CYCLE_DAYS } from "../deepContext.js";

/** Minimal HubSpot deal snapshot shape (workflow webhook or enriched payload). */
export interface HubSpotDealSnapshot {
  deal_id?: string | number;
  dealname?: string;
  dealstage?: string;
  /** HubSpot custom or calculated property — days deal has been in pipeline. */
  days_in_pipeline?: string | number;
  /** Optional CRM timeline notes attached by workflow or manual export. */
  timeline?: Array<{
    date?: string;
    stage?: string;
    body?: string;
    veto_holders?: unknown;
    objections?: unknown;
  }>;
  properties?: Record<string, string | number | null | undefined>;
}

export interface HubSpotWebhookPayload {
  /** Single deal snapshot or batch from workflow. */
  deal?: HubSpotDealSnapshot;
  deals?: HubSpotDealSnapshot[];
  /** Raw HubSpot subscription events (propertyChange) — logged only for now. */
  events?: unknown[];
}

export interface HubSpotMappedDeepContext {
  account_id: string;
  sales_cycle_days: number;
  historical_crm_context: HistoricalCrmContextEntry[];
  source: "hubspot_webhook";
  deal_id?: string;
  dealname?: string;
  dealstage?: string;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function parseDaysInPipeline(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(n, MAX_SALES_CYCLE_DAYS);
}

function resolveDealSnapshots(payload: HubSpotWebhookPayload): HubSpotDealSnapshot[] {
  if (payload.deal) return [payload.deal];
  if (Array.isArray(payload.deals) && payload.deals.length) return payload.deals;
  return [];
}

function readProp(
  deal: HubSpotDealSnapshot,
  key: string
): string | number | null | undefined {
  const top = (deal as Record<string, unknown>)[key];
  if (top != null && top !== "") return top as string | number;
  return deal.properties?.[key];
}

function mapTimelineEntry(
  entry: NonNullable<HubSpotDealSnapshot["timeline"]>[number]
): HistoricalCrmContextEntry | null {
  const date = String(entry.date ?? "").trim();
  const stage = String(entry.stage ?? "").trim();
  const body = String(entry.body ?? "").trim();
  const past_identified_veto_holders = normalizeVetoHolders(entry.veto_holders);
  const past_logged_objections = asStringArray(entry.objections);
  if (body && !past_logged_objections.length) {
    past_logged_objections.push(body);
  }

  if (!date && !stage && !past_identified_veto_holders.length && !past_logged_objections.length) {
    return null;
  }

  return {
    date,
    stage,
    past_identified_veto_holders,
    past_logged_objections,
  };
}

/** Map HubSpot deal webhook payload → Lazarus deep-context ingest fields. */
export function mapHubSpotDealToDeepContext(
  payload: HubSpotWebhookPayload
): HubSpotMappedDeepContext | null {
  const [deal] = resolveDealSnapshots(payload);
  if (!deal) return null;

  const dealId = String(deal.deal_id ?? readProp(deal, "hs_object_id") ?? "").trim();
  const dealname = String(deal.dealname ?? readProp(deal, "dealname") ?? "").trim();
  const dealstage = String(deal.dealstage ?? readProp(deal, "dealstage") ?? "").trim();
  const daysRaw = deal.days_in_pipeline ?? readProp(deal, "days_in_pipeline");
  const sales_cycle_days = parseDaysInPipeline(daysRaw) ?? MAX_SALES_CYCLE_DAYS;

  const historical_crm_context = (deal.timeline ?? [])
    .map(mapTimelineEntry)
    .filter((e): e is HistoricalCrmContextEntry => e !== null);

  if (!historical_crm_context.length && (dealstage || dealname)) {
    historical_crm_context.push({
      date: new Date().toISOString().slice(0, 10),
      stage: dealstage || "unknown",
      past_identified_veto_holders: [],
      past_logged_objections: dealname ? [`Deal: ${dealname}`] : [],
    });
  }

  const account_id =
    dealId ||
    dealname
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 64) ||
    "hubspot-deal";

  return {
    account_id,
    sales_cycle_days,
    historical_crm_context,
    source: "hubspot_webhook",
    ...(dealId ? { deal_id: dealId } : {}),
    ...(dealname ? { dealname } : {}),
    ...(dealstage ? { dealstage } : {}),
  };
}

export function verifyHubSpotWebhookSecret(
  provided: string | undefined,
  expected: string | undefined
): boolean {
  if (!expected?.trim()) return true;
  return provided?.trim() === expected.trim();
}
