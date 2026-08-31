import { getValidGoogleAccessToken } from "./oauth.js";

export interface ImportedEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function collectBodyParts(
  payload:
    | {
        mimeType?: string;
        body?: { data?: string };
        parts?: unknown[];
      }
    | null
    | undefined,
  out: { plain: string[]; html: string[] }
): void {
  if (!payload) return;
  if (payload.body?.data) {
    const text = decodeBase64Url(payload.body.data);
    if ((payload.mimeType ?? "").includes("html")) out.html.push(text);
    else out.plain.push(text);
  }
  for (const part of payload.parts ?? []) {
    collectBodyParts(part as typeof payload, out);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string
): string {
  const found = (headers ?? []).find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? "";
}

function parseMessagePayload(msg: {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    mimeType?: string;
    headers?: { name?: string; value?: string }[];
    body?: { data?: string };
    parts?: unknown[];
  };
}): ImportedEmailMessage {
  const collected = { plain: [] as string[], html: [] as string[] };
  collectBodyParts(msg.payload, collected);
  const body =
    collected.plain.join("\n\n").trim() ||
    collected.html.map(stripHtml).join("\n\n").trim() ||
    (msg.snippet ?? "").trim();

  return {
    id: msg.id ?? "",
    threadId: msg.threadId ?? "",
    subject: headerValue(msg.payload?.headers, "Subject"),
    from: headerValue(msg.payload?.headers, "From"),
    date: headerValue(msg.payload?.headers, "Date"),
    snippet: (msg.snippet ?? "").trim(),
    body,
  };
}

function messageSortKey(message: ImportedEmailMessage): number {
  const t = Date.parse(message.date);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Build a Gmail search query from a company / person / domain / free-text target.
 * Prefer conversation hits: subject, participants, and body — not a single inbox folder.
 */
export function buildGmailSearchQuery(target: string): string {
  const trimmed = target.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Enter a company, domain, person, or topic to search Gmail.");

  // Pass through advanced Gmail operators as-is (subject:, from:, newer_than:, etc.).
  if (/[a-z]+:/i.test(trimmed) || /\bOR\b|\bAND\b|\(|\)/.test(trimmed)) {
    return trimmed;
  }

  const domain = trimmed.match(/\b([a-z0-9-]+\.[a-z]{2,})\b/i)?.[1];
  if (domain) {
    return `(${trimmed} OR from:${domain} OR to:${domain} OR cc:${domain})`;
  }

  if (trimmed.includes("@")) {
    return `(${trimmed} OR from:${trimmed} OR to:${trimmed})`;
  }

  // Quoted phrase keeps multi-word deal names tight; bare token still matches bodies.
  if (/\s/.test(trimmed)) {
    return `"${trimmed.replace(/"/g, "")}"`;
  }
  return trimmed;
}

export function formatImportedEmailsAsThread(messages: ImportedEmailMessage[]): string {
  const sorted = [...messages].sort((a, b) => messageSortKey(a) - messageSortKey(b));
  const sections: string[] = [];
  let lastThread = "";

  for (const m of sorted) {
    if (m.threadId && m.threadId !== lastThread) {
      if (sections.length) sections.push("");
      sections.push(`=== EMAIL THREAD ${m.threadId.slice(0, 12)} ===`);
      lastThread = m.threadId;
    } else if (sections.length) {
      sections.push("");
      sections.push("-----Original Message-----");
      sections.push("");
    }

    const body = m.body || m.snippet;
    sections.push(
      [`From: ${m.from || "Unknown"}`, `Date: ${m.date || "Unknown"}`, `Subject: ${m.subject || "(no subject)"}`, "", body].join(
        "\n"
      )
    );
  }

  return sections.join("\n");
}

async function gmailFetch(path: string, token: string): Promise<Response> {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function fetchThreadMessages(
  token: string,
  threadId: string
): Promise<ImportedEmailMessage[]> {
  const res = await gmailFetch(`threads/${encodeURIComponent(threadId)}?format=full`, token);
  const data = (await res.json()) as {
    id?: string;
    messages?: {
      id?: string;
      threadId?: string;
      snippet?: string;
      payload?: {
        mimeType?: string;
        headers?: { name?: string; value?: string }[];
        body?: { data?: string };
        parts?: unknown[];
      };
    }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gmail thread fetch failed (${res.status})`);
  }

  return (data.messages ?? []).map((msg) =>
    parseMessagePayload({ ...msg, threadId: msg.threadId ?? threadId })
  );
}

/**
 * Search Gmail, then expand the top matching conversation threads so Lazarus
 * gets the full back-and-forth — not just the single hit message.
 */
export async function fetchGmailThreadsByQuery(
  query: string,
  options: { maxThreads?: number; maxMessages?: number; userId: string }
): Promise<{ messages: ImportedEmailMessage[]; threadCount: number; gmailQuery: string }> {
  const token = await getValidGoogleAccessToken(options.userId);
  if (!token) {
    throw new Error("Google is not connected. Connect Gmail first.");
  }

  const gmailQuery = buildGmailSearchQuery(query);
  const maxThreads = Math.min(Math.max(options?.maxThreads ?? 5, 1), 8);
  const maxMessages = Math.min(Math.max(options?.maxMessages ?? 40, 5), 60);

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(Math.min(maxThreads * 4, 25)));
  listUrl.searchParams.set("q", gmailQuery);

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId?: string }[];
    error?: { message?: string };
  };
  if (!listRes.ok) {
    throw new Error(listData.error?.message ?? `Gmail search failed (${listRes.status})`);
  }

  const threadIds: string[] = [];
  const seen = new Set<string>();
  for (const hit of listData.messages ?? []) {
    const threadId = hit.threadId?.trim();
    if (!threadId || seen.has(threadId)) continue;
    seen.add(threadId);
    threadIds.push(threadId);
    if (threadIds.length >= maxThreads) break;
  }

  // Fallback: list API sometimes omits threadId — fetch message metadata.
  if (!threadIds.length && (listData.messages ?? []).length) {
    for (const hit of listData.messages ?? []) {
      const metaRes = await gmailFetch(`messages/${encodeURIComponent(hit.id)}?format=metadata`, token);
      const meta = (await metaRes.json()) as { threadId?: string };
      const threadId = meta.threadId?.trim();
      if (!threadId || seen.has(threadId)) continue;
      seen.add(threadId);
      threadIds.push(threadId);
      if (threadIds.length >= maxThreads) break;
    }
  }

  const messages: ImportedEmailMessage[] = [];
  for (const threadId of threadIds) {
    try {
      const threadMessages = await fetchThreadMessages(token, threadId);
      messages.push(...threadMessages);
      if (messages.length >= maxMessages) break;
    } catch (err) {
      console.warn("[gmail] thread expand failed:", threadId, err);
    }
  }

  const trimmed = messages
    .sort((a, b) => messageSortKey(a) - messageSortKey(b))
    .slice(0, maxMessages);

  return {
    messages: trimmed,
    threadCount: new Set(trimmed.map((m) => m.threadId).filter(Boolean)).size || threadIds.length,
    gmailQuery,
  };
}

/** Fetch the N most recent Gmail inbox messages for the connected account. */
export async function fetchRecentGmailMessages(
  userId: string,
  limit = 10
): Promise<ImportedEmailMessage[]> {
  const token = await getValidGoogleAccessToken(userId);
  if (!token) {
    throw new Error("Google is not connected. Connect Gmail first.");
  }

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 25)));
  listUrl.searchParams.set("q", "in:inbox");

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = (await listRes.json()) as {
    messages?: { id: string; threadId?: string }[];
    error?: { message?: string };
  };
  if (!listRes.ok) {
    throw new Error(listData.error?.message ?? `Gmail list failed (${listRes.status})`);
  }

  const messages: ImportedEmailMessage[] = [];
  for (const hit of (listData.messages ?? []).slice(0, limit)) {
    const msgRes = await gmailFetch(`messages/${encodeURIComponent(hit.id)}?format=full`, token);
    const msg = (await msgRes.json()) as Parameters<typeof parseMessagePayload>[0] & {
      error?: { message?: string };
    };
    if (!msgRes.ok) {
      console.warn("[gmail] message fetch failed:", msg.error?.message ?? msgRes.status);
      continue;
    }
    messages.push(parseMessagePayload(msg));
  }
  return messages;
}

/** Search all connected Gmail mail and expand matching conversation threads. */
export async function fetchGmailMessagesByQuery(
  query: string,
  userId: string,
  limit = 20
): Promise<ImportedEmailMessage[]> {
  const result = await fetchGmailThreadsByQuery(query, {
    userId,
    maxThreads: Math.min(5, Math.max(1, Math.ceil(limit / 4))),
    maxMessages: limit,
  });
  return result.messages;
}

/** Pure helpers for regression tests (no network). */
export const gmailSearchTestUtils = {
  buildGmailSearchQuery,
  formatImportedEmailsAsThread,
};
