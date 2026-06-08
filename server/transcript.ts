import { enrichManualTranscript } from "./enrich.js";

export interface TranscriptSources {
  audio: boolean;
  manual: boolean;
}

export interface BuiltTranscript {
  text: string;
  sources: TranscriptSources;
  audioMeta?: {
    durationSeconds?: number;
    speakerCount?: number;
  };
}

export function buildAnalysisTranscript(options: {
  audioTranscript?: string;
  manualTranscript?: string;
  audioMeta?: { durationSeconds?: number; speakerCount?: number };
}): BuiltTranscript {
  const audio = options.audioTranscript?.trim() ?? "";
  const manual = enrichManualTranscript(options.manualTranscript ?? "");

  if (audio && manual) {
    return {
      text: [
        audio,
        "",
        "=== SUPPLEMENTAL NOTES / MANUAL TRANSCRIPT ===",
        manual,
      ].join("\n"),
      sources: { audio: true, manual: true },
      audioMeta: options.audioMeta,
    };
  }

  if (audio) {
    return {
      text: audio,
      sources: { audio: true, manual: false },
      audioMeta: options.audioMeta,
    };
  }

  if (manual) {
    return { text: manual, sources: { audio: false, manual: true } };
  }

  return { text: "", sources: { audio: false, manual: false } };
}
