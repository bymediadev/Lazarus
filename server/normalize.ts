/** Lazarus UI / prior analysis text accidentally pasted below the call */
const PASTED_ANALYSIS_MARKERS = [
  /Close-Out Brief/i,
  /Win Analysis Output/i,
  /Rescue Triage Output/i,
  /\bPost-Mortem\b/i,
  /FAILED\s*[—–-]\s*CLOSED LOST/i,
  /STALLED\s*[—–-]\s*RECOVERABLE/i,
  /SUCCESSFUL\s*[—–-]\s*WON/i,
  /Primary Cause of Death/i,
  /Primary Blocker/i,
  /Win Driver/i,
  /Failure Autopsy/i,
  /Momentum Blocker Analysis/i,
  /Why Momentum Froze/i,
  /Why It Closed/i,
  /Close-Out & Lessons/i,
  /Resuscitation Plan/i,
  /Protect & Expand Plan/i,
  /Copy Close-Out Items/i,
  /Copy Action Items/i,
  /Copy Next Steps/i,
  /Manual notes merged/i,
  /Audio transcribed/i,
  /Combined analysis/i,
];

/**
 * Remove a prior Lazarus analysis accidentally pasted after the call transcript.
 */
export function stripPastedAnalysisOutput(text: string): string {
  let earliest = -1;

  for (const marker of PASTED_ANALYSIS_MARKERS) {
    const idx = text.search(marker);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }

  // Only strip when marker appears well into the text (not part of the call itself)
  if (earliest > 400) {
    return text.slice(0, earliest).trim();
  }

  return text;
}

/**
 * Re-flow dense single-block transcripts into readable lines for the model.
 */
export function formatDenseTranscript(text: string): string {
  let t = text;

  t = t.replace(/TRANSCIPT:/gi, "TRANSCRIPT:");
  t = t.replace(/\r\n/g, "\n");

  // Headers
  t = t.replace(/\b(DATE:|SPEAKERS?:|TRANSCRIPT:)/gi, "\n$1\n");

  // Timestamps and recording markers
  t = t.replace(/\s*(\[00:\d{2}:\d{2}\])/g, "\n$1");
  t = t.replace(/\s*(\[Call recording[^\]]*\])/gi, "\n$1\n");

  // Speaker turns — initials (SJ:, MV:) or full labels
  t = t.replace(/\s+((?:SJ|MV|PROSPECT|REP|SPEAKER\s*[A-Z0-9]+):\s*)/gi, "\n$1");

  // Stage directions mid-line
  t = t.replace(/\s*(\[(?:Sighs|Long pause|Pause|Laughs)[^\]]*\])/gi, "\n$1\n");

  // Parenthetical delivery cues
  t = t.replace(/\s*(\((?:Sighs|Long pause|Pause|Laughs)[^)]*\))/gi, "\n$1\n");

  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeManualTranscript(text: string): string {
  let t = text.trim();
  if (!t) return "";

  t = stripPastedAnalysisOutput(t);

  const lineCount = (t.match(/\n/g) ?? []).length;
  if (t.length > 400 && lineCount < 8) {
    t = formatDenseTranscript(t);
  }

  return t;
}
