export type RedactionKind = "name" | "company" | "amount";

export type RedactionSpan = {
  start: number;
  end: number;
  kind: RedactionKind;
  text: string;
  replacement: string;
};

const TOKEN: Record<RedactionKind, string> = {
  name: "[REDACTED_NAME]",
  company: "[REDACTED_COMPANY]",
  amount: "[REDACTED_AMOUNT]",
};

const STOP = new Set(
  [
    "a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
    "deal", "deals", "legal", "security", "procurement", "finance", "budget",
    "forecast", "crm", "call", "meeting", "champion", "buyer", "rep", "manager",
    "sales", "vp", "ceo", "cro", "cfo", "cto", "ae", "sdr", "it", "q1", "q2", "q3", "q4",
    "lazarus", "google", "gemini", "hubspot", "salesforce", "zoom", "teams",
    "recoverable", "checkpoint", "next", "this", "that", "week", "weeks", "month", "months",
    "today", "eastern", "morning", "representative", "operations", "director", "president",
    "assessment", "review", "planning", "cycle", "workflow", "organizational", "annual",
  ]
);

const COMPANY_WORD = new Set(
  [
    "analytics", "capital", "group", "health", "labs", "logistics", "networks",
    "partners", "security", "software", "solutions", "systems", "technologies",
  ]
);

function replacementFor(kind: RedactionKind): string {
  return TOKEN[kind];
}

function isStop(word: string): boolean {
  return STOP.has(word.toLowerCase());
}

function pushSpan(
  spans: RedactionSpan[],
  input: string,
  start: number,
  end: number,
  kind: RedactionKind,
  replacement = replacementFor(kind)
) {
  if (end <= start || start < 0 || end > input.length) return;
  spans.push({ start, end, kind, text: input.slice(start, end), replacement });
}

function resolve(spans: RedactionSpan[]): RedactionSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: RedactionSpan[] = [];
  for (const span of sorted) {
    const last = kept[kept.length - 1];
    if (last && span.start < last.end) continue;
    kept.push(span);
  }
  return kept;
}

/** Pattern redaction. The visitor confirms the result before it is sent. */
export function findRedactions(input: string): RedactionSpan[] {
  const spans: RedactionSpan[] = [];

  for (const match of input.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    pushSpan(
      spans,
      input,
      index,
      index + match[0].length,
      "name",
      "[REDACTED_NAME]@[REDACTED_COMPANY]"
    );
  }

  for (const match of input.matchAll(
    /\b[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3}\s+(?:Inc|LLC|Ltd|Corp|Corporation|GmbH|Co)\b\.?/g
  )) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    pushSpan(spans, input, index, index + match[0].length, "company");
  }

  for (const match of input.matchAll(
    /(?:(?:usd|cad|eur|gbp|\$|€|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?[km])?)|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|usd)\b|\b\d+(?:\.\d+)?\s?[km]\b/gi
  )) {
    const index = match.index ?? -1;
    if (index < 0) continue;
    pushSpan(spans, input, index, index + match[0].length, "amount");
  }

  for (const match of input.matchAll(
    /^([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2})\s*[:\-–—]/gm
  )) {
    const name = match[1] ?? "";
    const index = match.index ?? -1;
    if (index < 0 || !name || name.split(/\s+/).some(isStop)) continue;
    pushSpan(spans, input, index, index + name.length, "name");
  }

  for (const match of input.matchAll(
    /\b(?:I am|I'm|this is|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g
  )) {
    const name = match[1] ?? "";
    const full = match.index ?? -1;
    if (full < 0 || !name) continue;
    const start = full + match[0].length - name.length;
    if (name.split(/\s+/).some(isStop)) continue;
    pushSpan(spans, input, start, start + name.length, "name");
  }

  for (const match of input.matchAll(/\b([A-Z][a-z]{2,20})\s+([A-Z][a-z]{2,20})\b/g)) {
    const first = match[1] ?? "";
    const second = match[2] ?? "";
    const index = match.index ?? -1;
    if (index < 0) continue;
    if (isStop(first)) continue;
    const kind: RedactionKind = COMPANY_WORD.has(second.toLowerCase()) ? "company" : "name";
    if (kind === "name" && isStop(second)) continue;
    pushSpan(spans, input, index, index + match[0].length, kind);
  }

  return resolve(spans);
}

export function applyRedactions(input: string, spans: RedactionSpan[]): string {
  let out = input;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, span.start) + span.replacement + out.slice(span.end);
  }
  return out;
}

export function redactTranscript(input: string): { text: string; spans: RedactionSpan[] } {
  const spans = findRedactions(input);
  return { text: applyRedactions(input, spans), spans };
}

export function redactionCounts(spans: RedactionSpan[]): Record<RedactionKind, number> {
  return {
    name: spans.filter((span) => span.kind === "name").length,
    company: spans.filter((span) => span.kind === "company").length,
    amount: spans.filter((span) => span.kind === "amount").length,
  };
}

/** Portal and qualifier both send these strings, never the pasted originals. */
export function redactEvidence(input: { transcript: string; email: string }): {
  transcript: { text: string; spans: RedactionSpan[] };
  email: { text: string; spans: RedactionSpan[] };
} {
  return {
    transcript: redactTranscript(input.transcript),
    email: redactTranscript(input.email),
  };
}
