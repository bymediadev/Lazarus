export const BOOKING_ZONE = "America/New_York";

/** Monday–Friday, 8:00 AM through 12:00 PM, plus 2:00 PM. Saturday and Sunday are closed. */
export const OPEN_HOURS = [8, 9, 10, 11, 12, 14] as const;

/** Zones a prospect can use for their own team meeting. */
export const MEETING_ZONES = [
  { id: "America/New_York", label: "New York (Eastern)" },
  { id: "America/Chicago", label: "Chicago (Central)" },
  { id: "America/Denver", label: "Denver (Mountain)" },
  { id: "America/Phoenix", label: "Phoenix (Arizona)" },
  { id: "America/Los_Angeles", label: "Los Angeles (Pacific)" },
  { id: "America/Toronto", label: "Toronto" },
  { id: "America/Vancouver", label: "Vancouver" },
  { id: "America/Mexico_City", label: "Mexico City" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Dublin", label: "Dublin" },
  { id: "Europe/Paris", label: "Paris" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
] as const;

export type MeetingZoneId = (typeof MEETING_ZONES)[number]["id"];

export function meetingZoneLabel(zone: string): string {
  const hit = MEETING_ZONES.find((item) => item.id === zone);
  return hit?.label ?? zone;
}

/** Prefer the browser zone when we know it. Otherwise New York. */
export function guessMeetingZone(): MeetingZoneId {
  try {
    const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (MEETING_ZONES.some((item) => item.id === guessed)) return guessed as MeetingZoneId;
  } catch {
    /* ignore */
  }
  return BOOKING_ZONE;
}

export type MorningSlot = {
  iso: string;
  label: string;
};

type Ymd = { year: number; month: number; day: number };

function partsInZone(date: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone = BOOKING_ZONE,
  minute = 0
): Date {
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const bag = partsInZone(utc, timeZone);
  const hourPart = bag.hour === "24" ? "0" : bag.hour;
  const asUtc = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    Number(hourPart),
    Number(bag.minute),
    0
  );
  return new Date(utc.getTime() - (asUtc - utc.getTime()));
}

export function isOpenSlot(date: Date, timeZone = BOOKING_ZONE): boolean {
  const bag = partsInZone(date, timeZone);
  const weekday = bag.weekday ?? "";
  const hour = Number(bag.hour === "24" ? "0" : bag.hour);
  const minute = Number(bag.minute);
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (minute !== 0 && minute !== 15 && minute !== 30 && minute !== 45) return false;
  return (OPEN_HOURS as readonly number[]).includes(hour);
}

function ymdInZone(date: Date, timeZone: string): Ymd {
  const bag = partsInZone(date, timeZone);
  return { year: Number(bag.year), month: Number(bag.month), day: Number(bag.day) };
}

function addCalendarDays(start: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(start.year, start.month - 1, start.day + days, 12, 0, 0));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function formatSlot(date: Date, timeZone = BOOKING_ZONE): string {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const zone = meetingZoneLabel(timeZone).replace(/\s*\([^)]*\)\s*$/, "").trim();
  return `${label} ${zone}`;
}

function findIso(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = findIso(entry, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Cal.com and Calendly booking events. A time outside the morning window is refused. */
export function bookingSlotFromMessage(data: unknown): { iso: string } | { refused: true } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  const booked =
    record.event === "calendly.event_scheduled" ||
    type === "bookingSuccessful" ||
    type.includes("bookingSuccessful");
  if (!booked) return null;
  const iso = findIso(record);
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime()) || !isOpenSlot(when)) return { refused: true };
  return { iso: when.toISOString() };
}

export function morningSlots(from = new Date(), limit = 8, timeZone = BOOKING_ZONE): MorningSlot[] {
  const start = ymdInZone(from, timeZone);
  const slots: MorningSlot[] = [];
  for (let day = 0; day < 21 && slots.length < limit; day += 1) {
    const date = addCalendarDays(start, day);
    for (const hour of OPEN_HOURS) {
      for (const minute of [0, 15, 30, 45]) {
        if (slots.length >= limit) return slots;
        const when = zonedTimeToUtc(date.year, date.month, date.day, hour, timeZone, minute);
        if (when.getTime() <= from.getTime()) continue;
        if (!isOpenSlot(when, timeZone)) continue;
        slots.push({ iso: when.toISOString(), label: formatSlot(when, timeZone) });
      }
    }
  }
  return slots;
}

const FORECAST_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Weekday mornings that still fall in the 48 hours before the forecast call. */
export function slotsBeforeForecast(
  forecastAt: Date,
  from = new Date(),
  limit = 8,
  timeZone = BOOKING_ZONE
): MorningSlot[] {
  if (Number.isNaN(forecastAt.getTime())) return [];
  const windowStart = forecastAt.getTime() - FORECAST_WINDOW_MS;
  return morningSlots(from, 120, timeZone)
    .filter((slot) => {
      const at = new Date(slot.iso).getTime();
      return at >= windowStart && at < forecastAt.getTime();
    })
    .slice(0, limit);
}

const TOO_SOON_MS = 3 * 60 * 60 * 1000;

/** A forecast inside 3 hours, or with no morning in the 48 hours before it, has no window. */
export function forecastWindow(forecastAt: Date, from = new Date()): "open" | "too-soon" | "none" {
  if (Number.isNaN(forecastAt.getTime()) || forecastAt.getTime() <= from.getTime()) return "none";
  if (forecastAt.getTime() - from.getTime() <= TOO_SOON_MS) return "too-soon";
  return slotsBeforeForecast(forecastAt, from, 1).length > 0 ? "open" : "none";
}

/** A datetime-local value, read as Eastern. */
export function forecastInstant(value: string, timeZone = BOOKING_ZONE): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const when = zonedTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    timeZone,
    Number(match[5])
  );
  return Number.isNaN(when.getTime()) ? null : when;
}
