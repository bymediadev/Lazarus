/** Trim, case-fold, and drop repeated rescue steps. */
export function uniqueActionSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of steps) {
    const trimmed = step.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
