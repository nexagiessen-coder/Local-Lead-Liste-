import { getZonedParts } from '@/lib/time';
import type { OpeningHours } from '@/lib/types';

export type OpenState = 'open' | 'closed' | 'unknown';

export interface OpeningStatus {
  state: OpenState;
  /** Human-readable detail, e.g. "Closes 18:00" or "Opens Mon 09:00". */
  detail: string | null;
  /** True when the source contained parts we could not parse. */
  partial: boolean;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Current open/closed state in the business's own timezone.
 * Returns `unknown` whenever hours are missing or entirely unparsed — never a
 * guess.
 */
export function getOpeningStatus(hours: OpeningHours | null, at = Date.now()): OpeningStatus {
  if (!hours) return { state: 'unknown', detail: null, partial: false };

  const hasAnyInterval = hours.days.some((d) => d.intervals.length > 0);
  const partial = hours.unparsed.length > 0;
  if (!hasAnyInterval) {
    return { state: 'unknown', detail: partial ? 'Hours could not be parsed' : null, partial };
  }

  const parts = getZonedParts(hours.timezone, at);
  const minutes = parts.hour * 60 + parts.minute;
  const today = hours.days.find((d) => d.weekday === parts.weekday);

  if (today && !today.closed) {
    for (const interval of today.intervals) {
      if (minutes >= interval.start && minutes < interval.end) {
        return {
          state: 'open',
          detail: `Closes ${formatMinutes(interval.end)}`,
          partial,
        };
      }
    }
    const next = today.intervals.find((i) => i.start > minutes);
    if (next) {
      return { state: 'closed', detail: `Opens ${formatMinutes(next.start)}`, partial };
    }
  }

  // Look ahead up to seven days for the next opening.
  for (let offset = 1; offset <= 7; offset++) {
    const weekday = (parts.weekday + offset) % 7;
    const day = hours.days.find((d) => d.weekday === weekday);
    if (!day || day.closed || day.intervals.length === 0) continue;
    const first = day.intervals[0]!;
    const label = offset === 1 ? 'tomorrow' : WEEKDAY_NAMES[weekday];
    return { state: 'closed', detail: `Opens ${label} ${formatMinutes(first.start)}`, partial };
  }

  return { state: 'closed', detail: null, partial };
}

export interface WeeklyScheduleRow {
  weekday: number;
  label: string;
  text: string;
  isToday: boolean;
}

/** Mon-first weekly schedule for display. */
export function weeklySchedule(hours: OpeningHours | null, at = Date.now()): WeeklyScheduleRow[] {
  if (!hours) return [];
  const todayWeekday = getZonedParts(hours.timezone, at).weekday;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => {
    const day = hours.days.find((d) => d.weekday === weekday);
    const text =
      !day || day.closed || day.intervals.length === 0
        ? 'Closed'
        : day.intervals.map((i) => `${formatMinutes(i.start)}–${formatMinutes(i.end)}`).join(', ');
    return {
      weekday,
      label: WEEKDAY_NAMES[weekday] ?? '',
      text,
      isToday: weekday === todayWeekday,
    };
  });
}
