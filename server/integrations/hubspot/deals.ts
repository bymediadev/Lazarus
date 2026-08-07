import {
  mapHubSpotDealToDeepContext,
  type HubSpotDealSnapshot,
  type HubSpotMappedDeepContext,
} from "../hubspot.js";
import { getValidHubSpotAccessToken } from "./oauth.js";

const CRM_BASE = "https://api.hubapi.com/crm/v3";

export interface HubSpotDealSearchHit {
  id: string;
  dealname: string;
  dealstage: string;
  amount: string | null;
  closedate: string | null;
  createdate: string | null;
}

export interface HubSpotNoteRecord {
  id: string;
  body: string;
  timestamp: string;
}

interface HubSpotApiDeal {
  id: string;
  properties?: Record<string, string | null | undefined>;
}

interface HubSpotSearchResponse {
  results?: HubSpotApiDeal[];
  message?: string;
}

interface HubSpotAssociationsResponse {
  results?: Array<{ id?: string; toObjectId?: string | number }>;
  message?: string;
}

interface HubSpotBatchReadResponse {
  results?: Array<{
    id: string;
    properties?: Record<string, string | null | undefined>;
  }>;
  message?: string;
}

async function hubspotFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidHubSpotAccessToken();
  if (!token) throw new Error("HubSpot is not connected or the access token expired.");

  return fetch(`${CRM_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function prop(deal: HubSpotApiDeal, key: string): string {
  return String(deal.properties?.[key] ?? "").trim();
}

function daysInPipelineFromCreate(createdate: string | null | undefined): number | undefined {
  if (!createdate) return undefined;
  const created = Date.parse(createdate);
  if (!Number.isFinite(created)) return undefined;
  const days = Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000));
  return days >= 1 ? days : undefined;
}

function mapDealHit(deal: HubSpotApiDeal): HubSpotDealSearchHit {
  return {
    id: String(deal.id),
    dealname: prop(deal, "dealname") || `(deal ${deal.id})`,
    dealstage: prop(deal, "dealstage"),
    amount: prop(deal, "amount") || null,
    closedate: prop(deal, "closedate") || null,
    createdate: prop(deal, "createdate") || null,
  };
}

/** Search deals by name (read-only CRM search). */
export async function searchHubSpotDeals(
  query: string,
  limit = 10
): Promise<HubSpotDealSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) throw new Error("Enter at least 2 characters to search deals.");

  const capped = Math.min(Math.max(limit, 1), 25);
  const res = await hubspotFetch("/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "dealname",
              operator: "CONTAINS_TOKEN",
              value: q,
            },
          ],
        },
      ],
      properties: ["dealname", "dealstage", "amount", "closedate", "createdate"],
      limit: capped,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    }),
  });

  const data = (await res.json()) as HubSpotSearchResponse;
  if (!res.ok) {
    throw new Error(data.message ?? `HubSpot deal search failed (${res.status})`);
  }
  return (data.results ?? []).map(mapDealHit);
}

async function fetchDealById(dealId: string): Promise<HubSpotApiDeal> {
  const params = new URLSearchParams({
    properties: ["dealname", "dealstage", "amount", "closedate", "createdate"].join(","),
  });
  const res = await hubspotFetch(`/objects/deals/${encodeURIComponent(dealId)}?${params}`);
  const data = (await res.json()) as HubSpotApiDeal & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? `HubSpot deal fetch failed (${res.status})`);
  }
  return data;
}

/** Associated note IDs for a deal (v3 associations). */
export async function fetchDealNoteIds(dealId: string): Promise<string[]> {
  const res = await hubspotFetch(
    `/objects/deals/${encodeURIComponent(dealId)}/associations/notes`
  );
  const data = (await res.json()) as HubSpotAssociationsResponse;
  if (!res.ok) {
    throw new Error(data.message ?? `HubSpot note associations failed (${res.status})`);
  }
  return (data.results ?? [])
    .map((r) => String(r.id ?? r.toObjectId ?? "").trim())
    .filter(Boolean);
}

export async function fetchNotesByIds(noteIds: string[]): Promise<HubSpotNoteRecord[]> {
  if (!noteIds.length) return [];

  const res = await hubspotFetch("/objects/notes/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: ["hs_note_body", "hs_timestamp", "hs_createdate"],
      inputs: noteIds.map((id) => ({ id })),
    }),
  });
  const data = (await res.json()) as HubSpotBatchReadResponse;
  if (!res.ok) {
    throw new Error(data.message ?? `HubSpot notes read failed (${res.status})`);
  }

  return (data.results ?? [])
    .map((note) => {
      const body = String(note.properties?.hs_note_body ?? "").trim();
      const timestamp = String(
        note.properties?.hs_timestamp ?? note.properties?.hs_createdate ?? ""
      ).trim();
      return { id: String(note.id), body, timestamp };
    })
    .filter((n) => n.body)
    .sort((a, b) => {
      const ta = Date.parse(a.timestamp) || 0;
      const tb = Date.parse(b.timestamp) || 0;
      return ta - tb;
    });
}

function noteDateIso(timestamp: string): string {
  const ms = Date.parse(timestamp);
  if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  const trimmed = timestamp.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Build webhook-shaped snapshot so mapHubSpotDealToDeepContext stays the single mapper. */
export function buildDealSnapshotFromApi(
  deal: HubSpotApiDeal,
  notes: HubSpotNoteRecord[]
): HubSpotDealSnapshot {
  const dealname = prop(deal, "dealname");
  const dealstage = prop(deal, "dealstage");
  const createdate = prop(deal, "createdate") || null;
  const days = daysInPipelineFromCreate(createdate);

  return {
    deal_id: String(deal.id),
    dealname,
    dealstage,
    ...(days != null ? { days_in_pipeline: days } : {}),
    properties: deal.properties ?? {},
    timeline: notes.map((note) => ({
      date: noteDateIso(note.timestamp),
      stage: dealstage || "note",
      body: note.body,
    })),
  };
}

export async function importHubSpotDealNotes(
  dealId: string
): Promise<{
  mapped: HubSpotMappedDeepContext;
  deal: HubSpotDealSearchHit;
  notes: HubSpotNoteRecord[];
  note_count: number;
}> {
  const id = dealId.trim();
  if (!id) throw new Error("dealId is required");

  const deal = await fetchDealById(id);
  const noteIds = await fetchDealNoteIds(id);
  const notes = await fetchNotesByIds(noteIds);
  const snapshot = buildDealSnapshotFromApi(deal, notes);
  const mapped = mapHubSpotDealToDeepContext({ deal: snapshot });
  if (!mapped) {
    throw new Error("Could not map HubSpot deal into Lazarus deep context.");
  }

  return {
    mapped,
    deal: mapDealHit(deal),
    notes,
    note_count: notes.length,
  };
}

/** Pure helpers exported for regression tests (no network). */
export const hubspotDealTestUtils = {
  daysInPipelineFromCreate,
  noteDateIso,
  buildDealSnapshotFromApi,
  mapDealHit,
};

/** Create a note on a HubSpot deal and associate it (Lazarus → CRM). */
export async function pushNoteToHubSpotDeal(
  dealId: string,
  noteBody: string
): Promise<{ noteId: string }> {
  const id = dealId.trim();
  const body = noteBody.trim();
  if (!id) throw new Error("dealId is required");
  if (!body) throw new Error("Note body is empty");

  const createRes = await hubspotFetch("/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: body,
        hs_timestamp: Date.now().toString(),
      },
    }),
  });
  const created = (await createRes.json()) as { id?: string; message?: string };
  if (!createRes.ok || !created.id) {
    throw new Error(created.message ?? `HubSpot note create failed (${createRes.status})`);
  }

  const assocRes = await hubspotFetch(
    `/objects/notes/${encodeURIComponent(created.id)}/associations/deals/${encodeURIComponent(id)}/note_to_deal`,
    { method: "PUT" }
  );
  if (!assocRes.ok) {
    // Fallback association type id 214 (note → deal) used by CRM v3
    const fallback = await hubspotFetch(
      `/objects/notes/${encodeURIComponent(created.id)}/associations/deals/${encodeURIComponent(id)}/214`,
      { method: "PUT" }
    );
    if (!fallback.ok) {
      const err = (await fallback.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? `HubSpot note association failed (${fallback.status})`);
    }
  }

  return { noteId: created.id };
}
