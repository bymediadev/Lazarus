/** Explains the intent inputs already used. Does not compute a new score. */
export function intentInputTrace(rawIntent: number, constraint: number, effectiveIntent: number): string {
  const rule = `Effective intent ${effectiveIntent} = raw intent ${rawIntent} × (100 − constraint ${constraint}) / 100 × the enabler multiplier.`;
  if (rawIntent === 0) {
    return `${rule} Raw intent is 0 because no Intent force was extracted. Constraint did not erase a positive intent score, and this is not a finding that the buyer has no interest.`;
  }
  return `${rule} Raw intent is the highest Intent-force weight. It is separate from the ability to get approval.`;
}

export function pinnedEquilibriumNote(state: string, structural: number, constraint: number): string | null {
  if (state !== "PINNED") return null;
  return `PINNED means the extracted structural weight ${structural} and constraint weight ${constraint} sum to at least 160. It is not a finding that the buyer rejected the deal.`;
}
