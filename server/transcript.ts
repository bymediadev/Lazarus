import { stitchContext, type StitchedContext, type TranscriptSources } from "./utils/contextStitcher.js";

export type { TranscriptSources, StitchedContext };

export interface BuiltTranscript extends StitchedContext {
  audioMeta?: {
    durationSeconds?: number;
    speakerCount?: number;
  };
}

export function buildAnalysisTranscript(options: {
  audioTranscript?: string;
  manualTranscript?: string;
  emailThread?: string;
  fieldTranscript?: string;
  fieldCaptureAudio?: boolean;
  audioMeta?: { durationSeconds?: number; speakerCount?: number };
  audioCapturedAt?: string;
  callCapturedAt?: string;
  emailCapturedAt?: string;
  fieldCapturedAt?: string;
}): BuiltTranscript {
  const stitched = stitchContext({
    audioTranscript: options.audioTranscript,
    callTranscript: options.manualTranscript,
    emailThread: options.emailThread,
    fieldTranscript: options.fieldTranscript,
    fieldCaptureAudio: options.fieldCaptureAudio,
    audioCapturedAt: options.audioCapturedAt,
    callCapturedAt: options.callCapturedAt,
    emailCapturedAt: options.emailCapturedAt,
    fieldCapturedAt: options.fieldCapturedAt,
  });

  return {
    ...stitched,
    audioMeta: options.audioMeta,
  };
}
