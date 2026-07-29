import { enrichManualTranscript } from "../enrich.js";

export type ContextChannel =
  | "call_audio"
  | "call_transcript"
  | "email_thread"
  | "field_recording"
  | "document";

export interface ContextEntry {
  channel: ContextChannel;
  content: string;
  sortKey: number;
  label: string;
}

export interface TranscriptSources {
  audio: boolean;
  manual: boolean;
  email: boolean;
  field: boolean;
  document: boolean;
}

export interface StitchedContext {
  text: string;
  entries: ContextEntry[];
  sources: TranscriptSources;
}

export interface StitchContextInput {
  audioTranscript?: string;
  callTranscript?: string;
  emailThread?: string;
  fieldTranscript?: string;
  documentText?: string;
  /** When true, transcribed upload audio is tagged as field / in-person capture */
  fieldCaptureAudio?: boolean;
  audioCapturedAt?: string;
  callCapturedAt?: string;
  emailCapturedAt?: string;
  fieldCapturedAt?: string;
  documentCapturedAt?: string;
}

const CHANNEL_LABELS: Record<ContextChannel, string> = {
  call_audio: "CALL RECORDING (TRANSCRIBED)",
  call_transcript: "CALL TRANSCRIPT / MEETING NOTES",
  email_thread: "STALLED EMAIL THREAD HISTORY",
  field_recording: "FIELD / IN-PERSON CAPTURE",
  document: "UPLOADED DOCUMENT (PDF / DOCX)",
};

const EMAIL_SPLIT =
  /(?=^(?:On .+ wrote:|From:\s|Sent:\s|Date:\s|-----Original Message-----|\d{1,2}\/\d{1,2}\/\d{2,4}))/im;

const MONTH_NAMES =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";

function pad2(value: string): string {
  return String(parseInt(value, 10)).padStart(2, "0");
}

function parseSortKey(text: string, fallback: number): number {
  const samples = text.slice(0, 400);

  const iso = samples.match(/\b(20\d{2}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?)/);
  if (iso) {
    const t = Date.parse(iso[1]);
    if (!Number.isNaN(t)) return t;
  }

  const us = samples.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + parseInt(us[3], 10) : parseInt(us[3], 10);
    const t = Date.parse(`${year}-${pad2(us[1])}-${pad2(us[2])}`);
    if (!Number.isNaN(t)) return t;
  }

  const named = new RegExp(
    `\\b(${MONTH_NAMES})\\s+(\\d{1,2}),?\\s+(20\\d{2})`,
    "i"
  ).exec(samples);
  if (named) {
    const t = Date.parse(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(t)) return t;
  }

  const onWrote = samples.match(/^On .+?(\w{3})\s+(\d{1,2}),?\s+(\d{4})/im);
  if (onWrote) {
    const t = Date.parse(`${onWrote[1]} ${onWrote[2]}, ${onWrote[3]}`);
    if (!Number.isNaN(t)) return t;
  }

  return fallback;
}

function isoToSortKey(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? fallback : t;
}

function splitChronologicalBlocks(text: string, baseSort: number): { content: string; sortKey: number }[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(EMAIL_SPLIT).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return [{ content: trimmed, sortKey: parseSortKey(trimmed, baseSort) }];
  }

  return parts.map((part, index) => ({
    content: part,
    sortKey: parseSortKey(part, baseSort + index),
  }));
}

function pushChannel(
  entries: ContextEntry[],
  channel: ContextChannel,
  raw: string,
  capturedAt?: string,
  baseOffset = 0
) {
  const content = enrichManualTranscript(raw).trim();
  if (!content) return;

  const fallback = isoToSortKey(capturedAt, Date.now() + baseOffset);
  const blocks = splitChronologicalBlocks(content, fallback);

  blocks.forEach((block, index) => {
    entries.push({
      channel,
      content: block.content,
      sortKey: block.sortKey + index * 0.001,
      label: CHANNEL_LABELS[channel],
    });
  });
}

/**
 * Cross-channel stitcher: merges call audio text, transcripts, email threads, and field
 * captures into a single chronologically sorted context block for LLM processing.
 */
export function stitchContext(input: StitchContextInput): StitchedContext {
  const entries: ContextEntry[] = [];

  if ((input.audioTranscript ?? "").trim()) {
    const channel: ContextChannel = input.fieldCaptureAudio ? "field_recording" : "call_audio";
    pushChannel(
      entries,
      channel,
      input.audioTranscript ?? "",
      input.fieldCaptureAudio ? input.fieldCapturedAt ?? input.audioCapturedAt : input.audioCapturedAt,
      0
    );
  }
  pushChannel(entries, "call_transcript", input.callTranscript ?? "", input.callCapturedAt, 1);
  pushChannel(entries, "email_thread", input.emailThread ?? "", input.emailCapturedAt, 2);
  if ((input.fieldTranscript ?? "").trim()) {
    pushChannel(entries, "field_recording", input.fieldTranscript ?? "", input.fieldCapturedAt, 3);
  }
  pushChannel(entries, "document", input.documentText ?? "", input.documentCapturedAt, 4);

  entries.sort((a, b) => a.sortKey - b.sortKey);

  const sections: string[] = [];
  let lastChannel: ContextChannel | null = null;

  for (const entry of entries) {
    if (entry.channel !== lastChannel) {
      if (sections.length) sections.push("");
      sections.push(`=== ${entry.label} ===`);
      lastChannel = entry.channel;
    } else if (sections.length) {
      sections.push("");
    }
    sections.push(entry.content);
  }

  const audio = (input.audioTranscript ?? "").trim();
  const manual = enrichManualTranscript(input.callTranscript ?? "").trim();
  const email = enrichManualTranscript(input.emailThread ?? "").trim();
  const fieldText = enrichManualTranscript(input.fieldTranscript ?? "").trim();
  const document = enrichManualTranscript(input.documentText ?? "").trim();
  const fieldAudio = input.fieldCaptureAudio && !!audio;

  return {
    text: sections.join("\n"),
    entries,
    sources: {
      audio: !!audio && !input.fieldCaptureAudio,
      manual: !!manual,
      email: !!email,
      field: fieldAudio || !!fieldText,
      document: !!document,
    },
  };
}
