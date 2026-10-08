/** Keep the narrative on the resolved blocker. A missed demo must not still be described as structural. */
export function alignBlockerNarrative(text: string, blocker: string): string {
  if (!text || !blocker.toUpperCase().includes("TEMPORARY")) return text;
  return text
    .replace(/\bprimary blocker is structural\b/gi, "primary blocker is temporary")
    .replace(/\bblocker is structural\b/gi, "blocker is temporary")
    .replace(/\bstructural lock-?ins?\b/gi, "temporary blockers")
    .replace(/\bstructural prerequisite\b/gi, "temporary blocker")
    .replace(/\bstructural blocker\b/gi, "temporary blocker");
}
