import { API_BASE, apiAuthHeaders } from "./api";

export interface EmailProviderStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  connected_at: string | null;
  note: string;
}

export interface EmailImportResult {
  ok: boolean;
  provider: "gmail" | "outlook";
  count: number;
  thread_count?: number;
  query?: string;
  gmail_query?: string;
  thread: string;
  messages: {
    id: string;
    threadId?: string;
    conversationId?: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
  }[];
}

/**
 * Pull the likely mailbox target from a natural-language request.
 * Gmail/Graph then search message bodies, subjects, and participants for this value.
 */
export function extractMailboxSearchTarget(request: string): string {
  const trimmed = request.trim();
  if (!trimmed) return "";

  const quoted = trimmed.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const threadFor = trimmed.match(
    /\b(?:thread|emails?|messages?|mailbox|inbox)\s+(?:for|about|on|with)\s+(.+?)(?=\s+(?:and|then|to|see|tell|what|whether|if)\b|[?.!,]|$)/i
  );
  if (threadFor?.[1]) return cleanupMailboxTarget(threadFor[1]);

  const pullUp = trimmed.match(
    /\b(?:pull\s*up|find|get|show|search|look\s*(?:through|up)?)\s+(?:the\s+)?(?:thread|emails?|messages?)?\s*(?:for|about|on|with)?\s*(.+?)(?=\s+(?:and|then|to|see|tell|what|whether|if)\b|[?.!,]|$)/i
  );
  if (pullUp?.[1]) {
    const cleaned = cleanupMailboxTarget(
      pullUp[1].replace(/^(?:my\s+)?(?:thread|emails?|messages?)\s+(?:for|about|on|with)\s+/i, "")
    );
    if (cleaned.length >= 2) return cleaned;
  }

  const afterFor = trimmed.match(
    /\bfor\s+(.+?)(?=\s+(?:and|then|to|see|tell|what|whether|if)\b|[?.!,]|$)/i
  );
  if (afterFor?.[1]) return cleanupMailboxTarget(afterFor[1]);

  const about = trimmed.match(
    /\babout\s+(.+?)(?=\s+(?:and|then|to|see|tell|what|whether|if)\b|[?.!,]|$)/i
  );
  return cleanupMailboxTarget(about?.[1] ?? trimmed);
}

function cleanupMailboxTarget(value: string): string {
  return value
    .replace(/^(?:the\s+)?(?:thread|emails?|messages?)\s+(?:for|about|on|with)\s+/i, "")
    .replace(/\s+(?:thread|emails?|messages?|deal)?\s*$/i, "")
    .trim();
}

export async function fetchGmailStatus(): Promise<EmailProviderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/google/status`, {
    headers: apiAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Gmail status failed (${res.status})`);
  return res.json() as Promise<EmailProviderStatus>;
}

export async function fetchOutlookStatus(): Promise<EmailProviderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/teams/status`, {
    headers: apiAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Outlook status failed (${res.status})`);
  return res.json() as Promise<EmailProviderStatus>;
}

export function gmailConnectUrl(): string {
  return `${API_BASE}/api/integrations/google/connect`;
}

export function outlookConnectUrl(): string {
  return `${API_BASE}/api/integrations/teams/connect`;
}

export async function disconnectGmail(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/google/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function disconnectOutlook(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/teams/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function importGmailEmails(limit = 10): Promise<EmailImportResult> {
  const res = await fetch(`${API_BASE}/api/integrations/google/import-emails`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ limit }),
  });
  const data = (await res.json()) as EmailImportResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Gmail import failed (${res.status})`);
  return data;
}

export async function importOutlookEmails(limit = 10): Promise<EmailImportResult> {
  const res = await fetch(`${API_BASE}/api/integrations/teams/import-emails`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ limit }),
  });
  const data = (await res.json()) as EmailImportResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Outlook import failed (${res.status})`);
  return data;
}

async function searchProviderEmails(
  provider: "google" | "teams",
  query: string
): Promise<EmailImportResult> {
  const res = await fetch(`${API_BASE}/api/integrations/${provider}/search-emails`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ query }),
  });
  const data = (await res.json()) as EmailImportResult & { error?: string };
  if (!res.ok) {
    throw new Error(
      data.error ?? `${provider === "google" ? "Gmail" : "Outlook"} search failed (${res.status})`
    );
  }
  return data;
}

export function searchGmailEmails(request: string): Promise<EmailImportResult> {
  return searchProviderEmails("google", extractMailboxSearchTarget(request));
}

export function searchOutlookEmails(request: string): Promise<EmailImportResult> {
  return searchProviderEmails("teams", extractMailboxSearchTarget(request));
}
