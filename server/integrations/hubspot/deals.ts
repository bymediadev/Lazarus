import {
  mapHubSpotDealToDeepContext,
  type HubSpotDealSnapshot,
  type HubSpotMappedDeepContext,
} from "../hubspot.js";
import { getValidHubSpotAccessToken } from "./oauth.js";
import { loadHubSpotTokens } from "./tokens.js";

const CRM_BASE = "https://api.hubapi.com/crm/v3";

const HUBSPOT_DEAL_PROPERTIES = [
  "dealname",
  "dealstage",
  "hs_is_closed",
  "amount",
  "closedate",
  "createdate",
  "hs_next_step",
  "notes_last_contacted",
  "engagements_last_meeting_booked",
  "hs_latest_meeting_activity",
];

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

async function hubspotFetch(userId: string, path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidHubSpotAccessToken(userId);
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
  userId: string,
  query: string,
  limit = 10
): Promise<HubSpotDealSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) throw new Error("Enter at least 2 characters to search deals.");

  const capped = Math.min(Math.max(limit, 1), 25);
  const res = await hubspotFetch(userId,"/objects/deals/search", {
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
      properties: HUBSPOT_DEAL_PROPERTIES,
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

async function fetchDealById(userId: string, dealId: string): Promise<HubSpotApiDeal> {
  const params = new URLSearchParams({
    properties: HUBSPOT_DEAL_PROPERTIES.join(","),
  });
  const res = await hubspotFetch(userId,`/objects/deals/${encodeURIComponent(dealId)}?${params}`);
  const data = (await res.json()) as HubSpotApiDeal & { message?: string };
  if (!res.ok) {
    throw new Error(data.message ?? `HubSpot deal fetch failed (${res.status})`);
  }
  return data;
}

/** Where the deal sits, from properties deals.read already grants. */
export function hubspotPositionBody(
  properties: Record<string, string | null | undefined> | undefined
): string {
  const read = (key: string) => String(properties?.[key] ?? "").trim();
  const bits = [
    read("dealstage") && `Stage: ${read("dealstage")}`,
    read("amount") && `Amount: ${read("amount")}`,
    read("closedate") && `Close date: ${read("closedate")}`,
    read("hs_next_step") && `Next step on record: ${read("hs_next_step")}`,
    read("notes_last_contacted") && `Last contacted: ${read("notes_last_contacted")}`,
    read("engagements_last_meeting_booked") &&
      `Last meeting booked: ${read("engagements_last_meeting_booked")}`,
    read("hs_latest_meeting_activity") &&
      `Latest meeting activity: ${read("hs_latest_meeting_activity")}`,
  ].filter(Boolean);
  return bits.join(". ");
}

async function fetchOptionalAssociationIds(
  userId: string,
  dealId: string,
  objectType: "meetings" | "tasks"
): Promise<string[]> {
  const res = await hubspotFetch(
    userId,
    `/objects/deals/${encodeURIComponent(dealId)}/associations/${objectType}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as HubSpotAssociationsResponse;
  return (data.results ?? [])
    .map((row) => String(row.id ?? row.toObjectId ?? "").trim())
    .filter(Boolean);
}

async function fetchHubSpotActivities(userId: string, dealId: string): Promise<HubSpotNoteRecord[]> {
  const [meetingIds, taskIds] = await Promise.all([
    fetchOptionalAssociationIds(userId, dealId, "meetings"),
    fetchOptionalAssociationIds(userId, dealId, "tasks"),
  ]);
  const records: HubSpotNoteRecord[] = [];
  if (meetingIds.length) {
    const res = await hubspotFetch(userId, "/objects/meetings/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time"],
        inputs: meetingIds.slice(0, 50).map((id) => ({ id })),
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as HubSpotBatchReadResponse;
      for (const row of data.results ?? []) {
        const title = String(row.properties?.hs_meeting_title ?? "").trim();
        const body = String(row.properties?.hs_meeting_body ?? "").trim();
        const text = [title && `Meeting: ${title}`, body].filter(Boolean).join(". ");
        if (!text) continue;
        records.push({
          id: String(row.id),
          body: text,
          timestamp: String(row.properties?.hs_meeting_start_time ?? ""),
        });
      }
    }
  }
  if (taskIds.length) {
    const res = await hubspotFetch(userId, "/objects/tasks/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_task_subject", "hs_task_body", "hs_task_status", "hs_timestamp"],
        inputs: taskIds.slice(0, 50).map((id) => ({ id })),
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as HubSpotBatchReadResponse;
      for (const row of data.results ?? []) {
        const subject = String(row.properties?.hs_task_subject ?? "").trim();
        const body = String(row.properties?.hs_task_body ?? "").trim();
        const status = String(row.properties?.hs_task_status ?? "").trim();
        const text = [subject && `Task: ${subject}`, status && `(${status})`, body]
          .filter(Boolean)
          .join(" ");
        if (!text) continue;
        records.push({
          id: String(row.id),
          body: text,
          timestamp: String(row.properties?.hs_timestamp ?? ""),
        });
      }
    }
  }
  return records;
}

/** Associated note IDs for a deal (v3 associations). */
export async function fetchDealNoteIds(userId: string, dealId: string): Promise<string[]> {
  const res = await hubspotFetch(userId,
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

export async function fetchNotesByIds(userId: string, noteIds: string[]): Promise<HubSpotNoteRecord[]> {
  if (!noteIds.length) return [];

  const res = await hubspotFetch(userId,"/objects/notes/batch/read", {
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
  userId: string,
  dealId: string
): Promise<{
  mapped: HubSpotMappedDeepContext;
  deal: HubSpotDealSearchHit;
  notes: HubSpotNoteRecord[];
  note_count: number;
}> {
  const id = dealId.trim();
  if (!id) throw new Error("dealId is required");

  const deal = await fetchDealById(userId, id);
  const noteIds = await fetchDealNoteIds(userId, id);
  const notes = await fetchNotesByIds(userId, noteIds);
  const position = hubspotPositionBody(deal.properties);
  if (position) {
    notes.unshift({
      id: "position",
      body: position,
      timestamp: new Date().toISOString(),
    });
  }
  notes.push(...(await fetchHubSpotActivities(userId, id)));
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
  hubspotPositionBody,
};

/** Create a note on a HubSpot deal and associate it (Lazarus → CRM). */
export async function pushNoteToHubSpotDeal(
  userId: string,
  dealId: string,
  noteBody: string
): Promise<{ noteId: string }> {
  const id = dealId.trim();
  const body = noteBody.trim();
  if (!id) throw new Error("dealId is required");
  if (!body) throw new Error("Note body is empty");

  const createRes = await hubspotFetch(userId,"/objects/notes", {
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

  const assocRes = await hubspotFetch(userId,
    `/objects/notes/${encodeURIComponent(created.id)}/associations/deals/${encodeURIComponent(id)}/note_to_deal`,
    { method: "PUT" }
  );
  if (!assocRes.ok) {
    // Fallback association type id 214 (note → deal) used by CRM v3
    const fallback = await hubspotFetch(userId,
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

/** Writes the score onto the deal's next step. Does not move the pipeline stage. */
export async function writeHubSpotNextStep(
  userId: string,
  dealId: string,
  nextStep: string
): Promise<void> {
  const id = dealId.trim();
  const value = nextStep.trim().slice(0, 255);
  if (!id || !value) throw new Error("dealId and next step are required");
  const res = await hubspotFetch(userId, `/objects/deals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { hs_next_step: value } }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `HubSpot next step update failed (${res.status})`);
  }
}

/** True only when this user's HubSpot token can read the deal. */
export async function userOwnsHubSpotDeal(
  userId: string,
  dealId: string
): Promise<{ ok: boolean; portalId: string }> {
  const portalId = loadHubSpotTokens(userId)?.hub_id ?? "";
  const token = await getValidHubSpotAccessToken(userId);
  const id = dealId.trim();
  if (!token || !id) return { ok: false, portalId };
  const res = await fetch(`${CRM_BASE}/objects/deals/${encodeURIComponent(id)}?properties=dealname`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, portalId };
  return { ok: true, portalId };
}
