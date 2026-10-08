function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/** Share of the shorter quote's words that also appear in the longer quote. */
export function quoteOverlap(a: string, b: string): number {
  const left = new Set(words(a));
  const right = new Set(words(b));
  const small = left.size <= right.size ? left : right;
  const large = small === left ? right : left;
  if (!small.size) return 0;
  let shared = 0;
  for (const word of small) {
    if (large.has(word)) shared += 1;
  }
  return shared / small.size;
}

/** Keep the longer quote when two excerpts overlap by more than 70%. */
export function mergeOverlappingQuotes(quotes: string[]): string[] {
  const kept: string[] = [];
  for (const quote of quotes) {
    const trimmed = quote.replace(/^"|"$/g, "").trim();
    if (!trimmed) continue;
    const match = kept.findIndex((existing) => quoteOverlap(existing, trimmed) > 0.7);
    if (match === -1) {
      kept.push(trimmed);
      continue;
    }
    if (trimmed.length > kept[match].length) kept[match] = trimmed;
  }
  return kept;
}
