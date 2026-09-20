/** Time helpers. Everything stored in the database is unix epoch ms (UTC). */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function now(): number {
  return Date.now();
}

export function daysAgo(days: number, from = Date.now()): number {
  return from - days * DAY;
}

export function startOfDayUtc(ts = Date.now()): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Local-day boundaries for a given IANA timezone, returned as epoch ms. */
export function startOfLocalDay(timeZone: string, ts = Date.now()): number {
  const parts = getZonedParts(timeZone, ts);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  const offset = getZoneOffsetMs(timeZone, ts);
  return asUtc - offset;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Breaks a timestamp into calendar parts in a specific IANA timezone. */
export function getZonedParts(timeZone: string, ts = Date.now()): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can emit "24" for midnight with hour12:false in some runtimes.
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(String(parts.weekday))),
  };
}

function getZoneOffsetMs(timeZone: string, ts: number): number {
  const p = getZonedParts(timeZone, ts);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  const rounded = Math.floor(ts / MINUTE) * MINUTE;
  return asUtc - rounded;
}

/** Minutes since local midnight in the given timezone. */
export function minutesOfDay(timeZone: string, ts = Date.now()): number {
  const p = getZonedParts(timeZone, ts);
  return p.hour * 60 + p.minute;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
