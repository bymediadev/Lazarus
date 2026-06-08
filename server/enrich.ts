/** Enrich pasted transcripts so the model treats stage directions as listenable context. */
export function enrichManualTranscript(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const hasStageDirections = /\([^)]+\)|\[[^\]]+\]/i.test(trimmed);
  const hasSpeakerLabels = /^(PROSPECT|REP|SPEAKER|SARAH|BUYER|SELLER)\s*:/im.test(trimmed);

  if (!hasStageDirections && !hasSpeakerLabels) {
    return trimmed;
  }

  return [
    "=== MANUAL TRANSCRIPT (stage directions & speaker labels — treat as delivery/tone evidence) ===",
    "Parentheticals like (Sighs), (Pauses), (Laughs) are tone cues from the call, not metadata.",
    "",
    trimmed,
  ].join("\n");
}
