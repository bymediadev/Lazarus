import { secureFetch } from "../../secureFetch.js";
import { getWhiteWhaleConfig } from "./config.js";

export class WhiteWhaleApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WhiteWhaleApiError";
    this.status = status;
  }
}

/** Normalize a company URL or domain to WhiteWhale account form (e.g. acme.com). */
export function normalizeCompanyDomain(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (!value) return "";

  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const slash = value.indexOf("/");
  if (slash >= 0) value = value.slice(0, slash);
  const query = value.indexOf("?");
  if (query >= 0) value = value.slice(0, query);
  value = value.replace(/\.+$/, "").trim();

  return value;
}

function authHeaders(apiKey: string, userEmail: string): Record<string, string> {
  return {
    "api-key": apiKey,
    user: userEmail,
    Accept: "application/json",
  };
}

async function whitewhaleFetch(
  path: string,
  init?: RequestInit & { query?: Record<string, string | string[] | boolean | number | undefined> }
): Promise<unknown> {
  const cfg = getWhiteWhaleConfig();
  if (!cfg) {
    throw new WhiteWhaleApiError("WhiteWhale is not configured on the server", 503);
  }

  const url = new URL(`${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const { query: _q, ...rest } = init ?? {};
  const res = await secureFetch(url.toString(), {
    ...rest,
    headers: {
      ...authHeaders(cfg.apiKey, cfg.userEmail),
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === "string"
          ? body.slice(0, 200)
          : res.statusText;
    throw new WhiteWhaleApiError(
      detail || `WhiteWhale API error (${res.status})`,
      res.status
    );
  }

  return body;
}

export interface WhiteWhaleRawAccount {
  id: string;
  name: string;
  icp_name?: string;
  icp_id?: string;
  owner_email?: string | null;
  summary?: string | null;
  scaled_score: number;
  status: string;
  account_data?: {
    full_name?: string | null;
    linkedin_url?: string | null;
    industry?: string | null;
    li_employees?: number | null;
    li_industry?: string | null;
    background?: string | null;
  } | null;
  signals?: WhiteWhaleRawSignal[] | null;
  signal_list?: string[] | null;
}

export interface WhiteWhaleRawSignal {
  trace_name: string;
  answer: unknown;
  long_answer?: string | null;
  question: string;
  date?: string | null;
  type?: string;
  q_rank?: number | null;
  prob?: number | null;
  top_articles?: Array<{
    source?: string | null;
    article_summary?: {
      headline?: string | null;
      quotes?: string[] | null;
      one_sentence_summary?: string | null;
    } | null;
  } | null> | null;
}

/** Fetch accounts filtered by domain(s). */
export async function getWhiteWhaleAccounts(opts: {
  domains?: string[];
  status?: "active" | "archived" | "farsight" | "all";
  signalData?: boolean;
  limit?: number;
}): Promise<WhiteWhaleRawAccount[]> {
  const body = await whitewhaleFetch("/v1/get_accounts", {
    method: "GET",
    query: {
      account_filter: opts.domains?.length ? opts.domains : undefined,
      status: opts.status ?? "all",
      signal_data: opts.signalData ?? true,
      people_data: false,
      lite: false,
      limit: opts.limit ?? 20,
      offset: 0,
    },
  });

  return Array.isArray(body) ? (body as WhiteWhaleRawAccount[]) : [];
}

/** Upload domains for monitoring. Default farsight=true (suggestions first; no credit burn). */
export async function uploadWhiteWhaleAccounts(opts: {
  domains: string[];
  farsight?: boolean;
  icp?: string;
}): Promise<unknown> {
  return whitewhaleFetch("/v1/upload_accounts", {
    method: "POST",
    body: JSON.stringify({
      accounts: opts.domains,
      farsight: opts.farsight ?? true,
      icp: opts.icp ?? "Master",
    }),
  });
}

export async function getWhiteWhaleUserOverview(): Promise<unknown> {
  return whitewhaleFetch("/v1/get_user_data", { method: "GET" });
}
