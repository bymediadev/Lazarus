import type { HistoricalCrmContextEntry } from "../../../shared/deepContextTypes.js";
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
}

async function sfFetch(path: string, init?: RequestInit): Promise<Response> {
  const creds = await getValidSalesforceAccessToken();
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
  query: string,
  limit = 15
): Promise<SalesforceOppHit[]> {
  const q = query.trim().replace(/'/g, "\\'");
  if (q.length < 2) throw new Error("Enter at least 2 characters to search opportunities.");
  const capped = Math.min(Math.max(limit, 1), 25);
  const soql = `SELECT Id, Name, StageName, Amount, CloseDate FROM Opportunity WHERE Name LIKE '%${q}%' ORDER BY LastModifiedDate DESC LIMIT ${capped}`;
  const res = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
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
  opportunityId: string
): Promise<{
  mapped: SalesforceMappedDeepContext;
  opportunity: SalesforceOppHit;
  note_count: number;
}> {
  const id = opportunityId.trim();
  if (!id) throw new Error("opportunityId is required");

  const oppRes = await sfFetch(
    `/services/data/v59.0/sobjects/Opportunity/${encodeURIComponent(id)}?fields=Id,Name,StageName,Amount,CloseDate,CreatedDate`
  );
  const opp = (await oppRes.json()) as {
    Id?: string;
    Name?: string;
    StageName?: string;
    Amount?: number | null;
    CloseDate?: string | null;
    CreatedDate?: string;
    message?: string;
  };
  if (!oppRes.ok || !opp.Id) {
    throw new Error(opp.message ?? `Salesforce opportunity fetch failed (${oppRes.status})`);
  }

  const soql = `SELECT Id, Body, CreatedDate FROM OpportunityFeed WHERE ParentId = '${id.replace(/'/g, "\\'")}' AND Type = 'TextPost' ORDER BY CreatedDate ASC LIMIT 50`;
  const feedRes = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
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

  const historical_crm_context: HistoricalCrmContextEntry[] = notes.map((n) => ({
    date: n.date || new Date().toISOString().slice(0, 10),
    stage: opp.StageName ?? "note",
    past_identified_veto_holders: [],
    past_logged_objections: [n.body.slice(0, 2000)],
  }));

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
    },
  };
}

export async function pushNoteToSalesforceOpportunity(
  opportunityId: string,
  noteBody: string
): Promise<{ feedItemId: string }> {
  const id = opportunityId.trim();
  const body = noteBody.trim();
  if (!id) throw new Error("opportunityId is required");
  if (!body) throw new Error("Note body is empty");

  const res = await sfFetch("/services/data/v59.0/sobjects/FeedItem", {
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
