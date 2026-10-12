const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthEnd(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

/**
 * A date written into a checkpoint is source timing. If that date is already
 * past, it is not a future commitment and no replacement date is invented.
 */
export function checkpointLine(checkpoint: string, now = new Date()): string {
  const text = checkpoint.trim();
  if (!text) return "";
  if (/that date is in the past/i.test(text)) {
    const cleaned = text.replace(/^Source timing:\s*/i, "");
    return `Source timing: ${cleaned}`;
  }

  let expired: Date | null = null;
  const month = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/i
  );
  if (month) {
    expired = monthEnd(Number(month[2]), MONTHS[month[1].toLowerCase()]);
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    expired = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  if (expired && startOfDay(expired) < startOfDay(now)) {
    return `Source timing: ${text}. That date is in the past. Current availability is not in this evidence.`;
  }
  return `Checkpoint: ${text}`;
}
