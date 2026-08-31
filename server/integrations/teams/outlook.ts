import { getValidTeamsAccessToken } from "./oauth.js";

export interface ImportedOutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
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

function messageSortKey(message: ImportedOutlookMessage): number {
  const t = Date.parse(message.date);
  return Number.isNaN(t) ? 0 : t;
}

function mapOutlookItem(item: {
  id?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  uniqueBody?: { contentType?: string; content?: string };
}): ImportedOutlookMessage {
  const fromName = item.from?.emailAddress?.name?.trim();
  const fromAddr = item.from?.emailAddress?.address?.trim();
  const from = fromName && fromAddr ? `${fromName} <${fromAddr}>` : fromAddr || fromName || "";
  const rawBody = item.uniqueBody?.content || item.body?.content || "";
  const contentType = (
    item.uniqueBody?.contentType ||
    item.body?.contentType ||
    "text"
  ).toLowerCase();
  const body =
    contentType === "html" ? stripHtml(rawBody) : rawBody.replace(/\s+/g, " ").trim();

  return {
    id: item.id ?? "",
    conversationId: item.conversationId?.trim() ?? "",
    subject: item.subject?.trim() ?? "",
    from,
    date: item.receivedDateTime ?? "",
    snippet: (item.bodyPreview ?? "").trim(),
    body: body || (item.bodyPreview ?? "").trim(),
  };
}

export function formatOutlookMessagesAsThread(messages: ImportedOutlookMessage[]): string {
  const sorted = [...messages].sort((a, b) => messageSortKey(a) - messageSortKey(b));
  const sections: string[] = [];
  let lastConversation = "";

  for (const m of sorted) {
    if (m.conversationId && m.conversationId !== lastConversation) {
      if (sections.length) sections.push("");
      sections.push(`=== EMAIL THREAD ${m.conversationId.slice(0, 12)} ===`);
      lastConversation = m.conversationId;
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

async function fetchOutlookMessages(
  userId: string,
  limit: number,
  query?: string
): Promise<ImportedOutlookMessage[]> {
  const token = await getValidTeamsAccessToken(userId);
  if (!token) {
    throw new Error("Microsoft is not connected. Connect Outlook first.");
  }

  const url = new URL(
    query
      ? "https://graph.microsoft.com/v1.0/me/messages"
      : "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"
  );
  url.searchParams.set("$top", String(Math.min(Math.max(limit, 1), 25)));
  if (query) {
    url.searchParams.set("$search", `"${query.replace(/"/g, '\\"')}"`);
  } else {
    url.searchParams.set("$orderby", "receivedDateTime desc");
  }
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,body,from,receivedDateTime,uniqueBody"
  );

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(query ? { ConsistencyLevel: "eventual" } : {}),
    },
  });
  const data = (await res.json()) as {
    value?: Parameters<typeof mapOutlookItem>[0][];
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? `Outlook list failed (${res.status})`);
  }

  return (data.value ?? []).map(mapOutlookItem);
}

async function expandOutlookConversation(
  token: string,
  conversationId: string,
  limit = 20
): Promise<ImportedOutlookMessage[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set("$filter", `conversationId eq '${conversationId.replace(/'/g, "''")}'`);
  url.searchParams.set("$orderby", "receivedDateTime asc");
  url.searchParams.set(
    "$select",
    "id,conversationId,subject,bodyPreview,body,from,receivedDateTime,uniqueBody"
  );

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    value?: Parameters<typeof mapOutlookItem>[0][];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `Outlook conversation expand failed (${res.status})`);
  }
  return (data.value ?? []).map(mapOutlookItem);
}

/** Fetch the N most recent Outlook inbox messages for the connected Microsoft account. */
export function fetchRecentOutlookMessages(
  userId: string,
  limit = 10
): Promise<ImportedOutlookMessage[]> {
  return fetchOutlookMessages(userId, limit);
}

/**
 * Search Outlook, then expand the top matching conversation threads so Lazarus
 * gets the full back-and-forth for the evidence package.
 */
export async function fetchOutlookThreadsByQuery(
  query: string,
  options: { maxThreads?: number; maxMessages?: number; userId: string }
): Promise<{ messages: ImportedOutlookMessage[]; threadCount: number }> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Enter a company, domain, person, or topic to search Outlook.");

  const token = await getValidTeamsAccessToken(options.userId);
  if (!token) {
    throw new Error("Microsoft is not connected. Connect Outlook first.");
  }

  const maxThreads = Math.min(Math.max(options?.maxThreads ?? 5, 1), 8);
  const maxMessages = Math.min(Math.max(options?.maxMessages ?? 40, 5), 60);
  const hits = await fetchOutlookMessages(options.userId, Math.min(maxThreads * 3, 25), trimmed);

  const conversationIds: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!hit.conversationId || seen.has(hit.conversationId)) continue;
    seen.add(hit.conversationId);
    conversationIds.push(hit.conversationId);
    if (conversationIds.length >= maxThreads) break;
  }

  if (!conversationIds.length) {
    return { messages: hits.slice(0, maxMessages), threadCount: hits.length ? 1 : 0 };
  }

  const messages: ImportedOutlookMessage[] = [];
  for (const conversationId of conversationIds) {
    try {
      const threadMessages = await expandOutlookConversation(token, conversationId, 20);
      messages.push(...(threadMessages.length ? threadMessages : hits.filter((h) => h.conversationId === conversationId)));
      if (messages.length >= maxMessages) break;
    } catch (err) {
      console.warn("[outlook] conversation expand failed:", conversationId, err);
      messages.push(...hits.filter((h) => h.conversationId === conversationId));
    }
  }

  const trimmedMessages = messages
    .sort((a, b) => messageSortKey(a) - messageSortKey(b))
    .slice(0, maxMessages);

  return {
    messages: trimmedMessages,
    threadCount:
      new Set(trimmedMessages.map((m) => m.conversationId).filter(Boolean)).size ||
      conversationIds.length,
  };
}

/** Search connected Outlook mail by company, domain, person, or topic. */
export async function fetchOutlookMessagesByQuery(
  query: string,
  userId: string,
  limit = 20
): Promise<ImportedOutlookMessage[]> {
  const result = await fetchOutlookThreadsByQuery(query, {
    userId,
    maxThreads: Math.min(5, Math.max(1, Math.ceil(limit / 4))),
    maxMessages: limit,
  });
  return result.messages;
}
