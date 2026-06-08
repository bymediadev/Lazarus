export interface TranscriptSources {
  audio: boolean;
  manual: boolean;
}

export interface BuiltTranscript {
  text: string;
  sources: TranscriptSources;
}

export function buildAnalysisTranscript(options: {
  audioTranscript?: string;
  manualTranscript?: string;
}): BuiltTranscript {
  const audio = options.audioTranscript?.trim() ?? "";
  const manual = options.manualTranscript?.trim() ?? "";

  if (audio && manual) {
    return {
      text: [
        "=== CALL RECORDING TRANSCRIPT (AssemblyAI) ===",
        audio,
        "",
        "=== SUPPLEMENTAL NOTES / MANUAL TRANSCRIPT ===",
        manual,
      ].join("\n"),
      sources: { audio: true, manual: true },
    };
  }

  if (audio) {
    return { text: audio, sources: { audio: true, manual: false } };
  }

  if (manual) {
    return { text: manual, sources: { audio: false, manual: true } };
  }

  return { text: "", sources: { audio: false, manual: false } };
}
