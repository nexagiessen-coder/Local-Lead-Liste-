import type { OpeningHours, OpeningHoursDay } from '@/lib/types';

/**
 * Parser for the OpenStreetMap `opening_hours` syntax (the common subset).
 *
 * Conservative by design: anything the parser does not fully understand is put
 * into `unparsed` and is shown to the user as unverified rather than being
 * guessed at. Opening hours are never invented.
 */

const DAY_TOKENS: Record<string, number> = {
  su: 0, so: 0, sun: 0, sunday: 0, sonntag: 0,
  mo: 1, mon: 1, monday: 1, montag: 1,
  tu: 2, di: 2, tue: 2, tues: 2, tuesday: 2, dienstag: 2,
  we: 3, mi: 3, wed: 3, wednesday: 3, mittwoch: 3,
  th: 4, do: 4, thu: 4, thur: 4, thursday: 4, donnerstag: 4,
  fr: 5, fri: 5, friday: 5, freitag: 5,
  sa: 6, sat: 6, saturday: 6, samstag: 6,
};

function emptyDays(): OpeningHoursDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, closed: true, intervals: [] }));
}

function parseDayToken(token: string): number | null {
  const key = token.trim().toLowerCase().replace(/\./g, '');
  return key in DAY_TOKENS ? DAY_TOKENS[key]! : null;
}

/** "09:30" -> 570 minutes. Returns null if not a valid time. */
export function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) {
    const hourOnly = value.trim().match(/^(\d{1,2})$/);
    if (!hourOnly?.[1]) return null;
    const h = Number(hourOnly[1]);
    return h >= 0 && h <= 24 ? h * 60 : null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function expandDayRange(spec: string): number[] | null {
  const days = new Set<number>();
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const range = trimmed.split('-');
    if (range.length === 1) {
      const day = parseDayToken(range[0]!);
      if (day === null) return null;
      days.add(day);
    } else if (range.length === 2) {
      const from = parseDayToken(range[0]!);
      const to = parseDayToken(range[1]!);
      if (from === null || to === null) return null;
      let cursor = from;
      for (let guard = 0; guard < 8; guard++) {
        days.add(cursor);
        if (cursor === to) break;
        cursor = (cursor + 1) % 7;
      }
    } else {
      return null;
    }
  }
  return days.size > 0 ? [...days] : null;
}

/**
 * Parses an OSM-style `opening_hours` string.
 * Returns null when nothing at all could be understood.
 */
export function parseOpeningHours(raw: string | null | undefined, timezone: string): OpeningHours | null {
  if (!raw || raw.trim() === '') return null;
  const days = emptyDays();
  const unparsed: string[] = [];
  let anyParsed = false;

  const normalized = raw.replace(/\s+/g, ' ').trim();

  if (/^24\/7$/i.test(normalized)) {
    return {
      days: days.map((d) => ({ ...d, closed: false, intervals: [{ start: 0, end: 24 * 60 }] })),
      raw: normalized,
      timezone,
      unparsed: [],
    };
  }

  for (const rule of normalized.split(';')) {
    const trimmed = rule.trim();
    if (trimmed === '') continue;

    // Unsupported constructs (date ranges, weeks, holidays, "sunrise") are
    // recorded verbatim rather than approximated.
    if (/\b(ph|sh|easter|week|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sunrise|sunset)\b/i.test(trimmed)) {
      unparsed.push(trimmed);
      continue;
    }

    const match = trimmed.match(/^([A-Za-zÀ-ÿ,\-. ]+?)\s*(off|closed|geschlossen|[\d:.,\- ]+)$/i);
    if (!match?.[1] || !match[2]) {
      unparsed.push(trimmed);
      continue;
    }

    const weekdays = expandDayRange(match[1]!);
    if (!weekdays) {
      unparsed.push(trimmed);
      continue;
    }

    const timePart = match[2]!.trim().toLowerCase();
    if (timePart === 'off' || timePart === 'closed' || timePart === 'geschlossen') {
      for (const weekday of weekdays) {
        days[weekday] = { weekday, closed: true, intervals: [] };
      }
      anyParsed = true;
      continue;
    }

    const intervals: Array<{ start: number; end: number }> = [];
    let ruleOk = true;
    for (const span of timePart.split(',')) {
      const bounds = span.trim().split('-');
      if (bounds.length !== 2) {
        ruleOk = false;
        break;
      }
      const start = parseClock(bounds[0]!);
      const end = parseClock(bounds[1]!);
      if (start === null || end === null) {
        ruleOk = false;
        break;
      }
      // Overnight spans (e.g. 18:00-02:00) are stored as two intervals.
      if (end <= start) {
        intervals.push({ start, end: 24 * 60 });
        intervals.push({ start: 0, end });
      } else {
        intervals.push({ start, end });
      }
    }

    if (!ruleOk || intervals.length === 0) {
      unparsed.push(trimmed);
      continue;
    }

    for (const weekday of weekdays) {
      const existing = days[weekday]!;
      days[weekday] = {
        weekday,
        closed: false,
        intervals: [...existing.intervals, ...intervals].sort((a, b) => a.start - b.start),
      };
    }
    anyParsed = true;
  }

  if (!anyParsed && unparsed.length === 0) return null;
  if (!anyParsed) {
    // Nothing usable — return the raw value so the UI can show it as unverified.
    return { days: emptyDays(), raw: normalized, timezone, unparsed };
  }
  return { days, raw: normalized, timezone, unparsed };
}

/** Builds structured hours from Google Places-style period objects. */
export function openingHoursFromPeriods(
  periods: Array<{ open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }>,
  timezone: string,
  raw: string | null = null,
): OpeningHours | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const days = emptyDays();
  let any = false;
  const unparsed: string[] = [];

  for (const period of periods) {
    const openDay = period.open?.day;
    if (typeof openDay !== 'number' || openDay < 0 || openDay > 6) {
      unparsed.push(JSON.stringify(period));
      continue;
    }
    const start = (period.open?.hour ?? 0) * 60 + (period.open?.minute ?? 0);
    const closeDay = period.close?.day;
    const rawEnd = period.close ? (period.close.hour ?? 0) * 60 + (period.close.minute ?? 0) : 24 * 60;
    const end = closeDay === openDay || period.close === undefined ? rawEnd : 24 * 60;

    const day = days[openDay]!;
    days[openDay] = {
      weekday: openDay,
      closed: false,
      intervals: [...day.intervals, { start, end: end <= start ? 24 * 60 : end }].sort((a, b) => a.start - b.start),
    };
    any = true;

    // Overnight period spilling into the next day.
    if (typeof closeDay === 'number' && closeDay !== openDay && rawEnd > 0) {
      const next = days[closeDay]!;
      days[closeDay] = {
        weekday: closeDay,
        closed: false,
        intervals: [...next.intervals, { start: 0, end: rawEnd }].sort((a, b) => a.start - b.start),
      };
    }
  }

  return any ? { days, raw, timezone, unparsed } : null;
}
