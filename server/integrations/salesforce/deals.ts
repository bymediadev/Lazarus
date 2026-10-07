import type { HistoricalCrmContextEntry } from "../../../shared/deepContextTypes.js";
import { isCrmDealComplete } from "../../crmClose.js";
import { getValidSalesforceAccessToken } from "./oauth.js";

export interface SalesforceOppHit {
  id: string;
  name: string;
  stageName: string;
  amount: number | null;
  closeDate: string | null;
}

export interface SalesforceMappedDeepContext {
  account_id: string;
  sales_cycle_days: number;
  historical_crm_context: HistoricalCrmContextEntry[];
  source: "salesforce";
  deal_id: string;
  dealname?: string;
  dealstage?: string;
  closed?: boolean;
}

export function salesforcePositionBody(opp: {
  StageName?: string | null;
  Amount?: number | null;
  CloseDate?: string | null;
  NextStep?: string | null;
}): string {
  const bits = [
    opp.StageName?.trim() && `Stage: ${opp.StageName.trim()}`,
    opp.Amount != null && Number.isFinite(opp.Amount) && `Amount: ${opp.Amount}`,
    opp.CloseDate?.trim() && `Close date: ${opp.CloseDate.trim()}`,
    opp.NextStep?.trim() && `Next step on record: ${opp.NextStep.trim()}`,
  ].filter(Boolean);
  return bits.join(". ");
}

async function sfQuery(
  userId: string,
  soql: string
): Promise<Array<Record<string, string | null | undefined>>> {
  const res = await sfFetch(userId, `/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    records?: Array<Record<string, string | null | undefined>>;
  };
  return data.records ?? [];
}

async function fetchSalesforceActivities(
  userId: string,
  opportunityId: string
): Promise<HistoricalCrmContextEntry[]> {
  const safeId = opportunityId.replace(/'/g, "\\'");
  const [tasks, events] = await Promise.all([
    sfQuery(
      userId,
      `SELECT Subject, ActivityDate, Description, Status FROM Task WHERE WhatId = '${safeId}' ORDER BY ActivityDate DESC LIMIT 30`
    ),
    sfQuery(
      userId,
      `SELECT Subject, StartDateTime, Description FROM Event WHERE WhatId = '${safeId}' ORDER BY StartDateTime DESC LIMIT 30`
    ),
  ]);
  const entries: HistoricalCrmContextEntry[] = [];
  for (const task of tasks) {
    const subject = String(task.Subject ?? "").trim();
    const description = String(task.Description ?? "").trim();
    const status = String(task.Status ?? "").trim();
    const text = [subject && `Task: ${subject}`, status && `(${status})`, description]
      .filter(Boolean)
      .join(" ");
    if (!text) continue;
    entries.push({
      date: String(task.ActivityDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      stage: "task",
      past_identified_veto_holders: [],
      past_logged_objections: [text.slice(0, 2000)],
    });
  }
  for (const event of events) {
    const subject = String(event.Subject ?? "").trim();
    const description = String(event.Description ?? "").trim();
    const text = [subject && `Meeting: ${subject}`, description].filter(Boolean).join(". ");
    if (!text) continue;
    entries.push({
      date: String(event.StartDateTime ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      stage: "meeting",
      past_identified_veto_holders: [],
      past_logged_objections: [text.slice(0, 2000)],
    });
  }
  return entries;
}

async function sfFetch(userId: string, path: string, init?: RequestInit): Promise<Response> {
  const creds = await getValidSalesforceAccessToken(userId);
  if (!creds) throw new Error("Salesforce is not connected or the access token expired.");
  const url = path.startsWith("http") ? path : `${creds.instanceUrl}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function searchSalesforceOpportunities(
  userId: string,
  query: string,
  limit = 15
): Promise<SalesforceOppHit[]> {
  const q = query.trim().replace(/'/g, "\\'");
  if (q.length < 2) throw new Error("Enter at least 2 characters to search opportunities.");
  const capped = Math.min(Math.max(limit, 1), 25);
  const soql = `SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE Name LIKE '%${q}%' ORDER BY LastModifiedDate DESC LIMIT ${capped}`;
  const res = await sfFetch(userId,`/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
  const data = (await res.json()) as {
    records?: Array<{
      Id: string;
      Name: string;
      StageName: string;
      Amount?: number | null;
      CloseDate?: string | null;
    }>;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? `Salesforce search failed (${res.status})`);
  }
  return (data.records ?? []).map((r) => ({
    id: r.Id,
    name: r.Name,
    stageName: r.StageName,
    amount: r.Amount ?? null,
    closeDate: r.CloseDate ?? null,
  }));
}

export async function importSalesforceOpportunityNotes(
  userId: string,
  opportunityId: string
): Promise<{
  mapped: SalesforceMappedDeepContext;
  opportunity: SalesforceOppHit;
  note_count: number;
}> {
  const id = opportunityId.trim();
  if (!id) throw new Error("opportunityId is required");

  const oppRes = await sfFetch(userId,
    `/services/data/v59.0/sobjects/Opportunity/${encodeURIComponent(id)}?fields=Id,Name,StageName,IsClosed,Amount,CloseDate,CreatedDate,NextStep`
  );
  const opp = (await oppRes.json()) as {
    Id?: string;
    Name?: string;
    StageName?: string;
    IsClosed?: boolean;
    Amount?: number | null;
    CloseDate?: string | null;
    CreatedDate?: string;
    NextStep?: string | null;
    message?: string;
  };
  if (!oppRes.ok || !opp.Id) {
    throw new Error(opp.message ?? `Salesforce opportunity fetch failed (${oppRes.status})`);
  }

  const soql = `SELECT Id, Body, CreatedDate FROM OpportunityFeed WHERE ParentId = '${id.replace(/'/g, "\\'")}' AND Type = 'TextPost' ORDER BY CreatedDate ASC LIMIT 50`;
  const feedRes = await sfFetch(userId,`/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
  const feed = (await feedRes.json()) as {
    records?: Array<{ Body?: string; CreatedDate?: string }>;
  };
  const notes = (feed.records ?? [])
    .map((r) => ({
      body: String(r.Body ?? "").trim(),
      date: String(r.CreatedDate ?? "").slice(0, 10),
    }))
    .filter((n) => n.body);

  const created = opp.CreatedDate ? Date.parse(opp.CreatedDate) : NaN;
  const days = Number.isFinite(created)
    ? Math.max(1, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)))
    : 90;

  const activities = await fetchSalesforceActivities(userId, id);
  const position = salesforcePositionBody(opp);
  const historical_crm_context: HistoricalCrmContextEntry[] = [
    ...(position
      ? [
          {
            date: new Date().toISOString().slice(0, 10),
            stage: opp.StageName ?? "open",
            past_identified_veto_holders: [],
            past_logged_objections: [position],
          },
        ]
      : []),
    ...notes.map((n) => ({
      date: n.date || new Date().toISOString().slice(0, 10),
      stage: opp.StageName ?? "note",
      past_identified_veto_holders: [],
      past_logged_objections: [n.body.slice(0, 2000)],
    })),
    ...activities,
  ];

  const opportunity: SalesforceOppHit = {
    id: opp.Id,
    name: opp.Name ?? `(opp ${opp.Id})`,
    stageName: opp.StageName ?? "",
    amount: opp.Amount ?? null,
    closeDate: opp.CloseDate ?? null,
  };

  return {
    opportunity,
    note_count: notes.length,
    mapped: {
      account_id: `salesforce:${opp.Id}`,
      sales_cycle_days: days,
      historical_crm_context,
      source: "salesforce",
      deal_id: opp.Id,
      dealname: opportunity.name,
      dealstage: opportunity.stageName,
      ...(isCrmDealComplete(opportunity.stageName, opp.IsClosed) ? { closed: true } : {}),
    },
  };
}

export async function pushNoteToSalesforceOpportunity(
  userId: string,
  opportunityId: string,
  noteBody: string
): Promise<{ feedItemId: string }> {
  const id = opportunityId.trim();
  const body = noteBody.trim();
  if (!id) throw new Error("opportunityId is required");
  if (!body) throw new Error("Note body is empty");

  const res = await sfFetch(userId,"/services/data/v59.0/sobjects/FeedItem", {
    method: "POST",
    body: JSON.stringify({
      ParentId: id,
      Body: body.slice(0, 10000),
      Type: "TextPost",
    }),
  });
  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok || !data.id) {
    throw new Error(data.message ?? `Salesforce FeedItem create failed (${res.status})`);
  }
  return { feedItemId: data.id };
}

/** Writes the score onto Opportunity.NextStep. Does not move the stage. */
export async function writeSalesforceNextStep(
  userId: string,
  opportunityId: string,
  nextStep: string
): Promise<void> {
  const id = opportunityId.trim();
  const value = nextStep.trim().slice(0, 255);
  if (!id || !value) throw new Error("opportunityId and next step are required");
  const res = await sfFetch(userId, `/services/data/v59.0/sobjects/Opportunity/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ NextStep: value }),
  });
  if (!res.ok && res.status !== 204) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Salesforce next step update failed (${res.status})`);
  }
}

/** True only when this user's Salesforce token can read the opportunity. */
export async function userOwnsSalesforceOpportunity(
  userId: string,
  opportunityId: string
): Promise<{ ok: boolean; portalId: string }> {
  const auth = await getValidSalesforceAccessToken(userId);
  const id = opportunityId.trim();
  if (!auth || !id) return { ok: false, portalId: auth?.instanceUrl ?? "" };
  const res = await fetch(
    `${auth.instanceUrl}/services/data/v59.0/sobjects/Opportunity/${encodeURIComponent(id)}?fields=Id`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } }
  );
  if (!res.ok) return { ok: false, portalId: auth.instanceUrl };
  return { ok: true, portalId: auth.instanceUrl };
}
