import { describe, it, expect } from 'vitest';
import { parseOpeningHours, openingHoursFromPeriods, parseClock } from '@/lib/hours/parse';
import { getOpeningStatus, weeklySchedule } from '@/lib/hours/status';

const TZ = 'Europe/Berlin';
/** Wednesday 2026-09-23, 10:00 local (08:00 UTC in CEST). */
const WED_10 = Date.UTC(2026, 8, 23, 8, 0);
/** Wednesday 2026-09-23, 20:00 local. */
const WED_20 = Date.UTC(2026, 8, 23, 18, 0);
/** Sunday 2026-09-27, 12:00 local. */
const SUN_12 = Date.UTC(2026, 8, 27, 10, 0);

describe('opening hours parsing', () => {
  it('parses a weekday range with a Saturday exception', () => {
    const hours = parseOpeningHours('Mo-Fr 09:00-18:30; Sa 09:00-14:00; Su off', TZ);
    expect(hours).not.toBeNull();
    expect(hours!.days.find((d) => d.weekday === 3)?.intervals).toEqual([{ start: 540, end: 1110 }]);
    expect(hours!.days.find((d) => d.weekday === 6)?.intervals).toEqual([{ start: 540, end: 840 }]);
    expect(hours!.days.find((d) => d.weekday === 0)?.closed).toBe(true);
    expect(hours!.unparsed).toEqual([]);
  });

  it('parses a split day', () => {
    const hours = parseOpeningHours('Tu-Su 11:30-14:30,17:30-23:00; Mo off', TZ);
    const tuesday = hours!.days.find((d) => d.weekday === 2);
    expect(tuesday?.intervals).toEqual([
      { start: 690, end: 870 },
      { start: 1050, end: 1380 },
    ]);
  });

  it('parses 24/7', () => {
    const hours = parseOpeningHours('24/7', TZ);
    expect(hours!.days.every((d) => !d.closed)).toBe(true);
    expect(getOpeningStatus(hours, WED_20).state).toBe('open');
  });

  it('splits an overnight span across two days', () => {
    const hours = parseOpeningHours('Fr 18:00-02:00', TZ);
    const friday = hours!.days.find((d) => d.weekday === 5);
    expect(friday?.intervals).toEqual([
      { start: 0, end: 120 },
      { start: 1080, end: 1440 },
    ]);
  });

  it('records rules it cannot understand instead of guessing', () => {
    const hours = parseOpeningHours('Mo-Fr 09:00-17:00; PH off; Jan 01 off', TZ);
    expect(hours!.unparsed.length).toBe(2);
    expect(hours!.days.find((d) => d.weekday === 1)?.intervals).toHaveLength(1);
  });

  it('returns null for empty input rather than an empty week', () => {
    expect(parseOpeningHours(null, TZ)).toBeNull();
    expect(parseOpeningHours('', TZ)).toBeNull();
  });

  it('parses clock values and rejects nonsense', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('24:00')).toBe(1440);
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });

  it('builds hours from provider period objects', () => {
    const hours = openingHoursFromPeriods(
      [{ open: { day: 3, hour: 9, minute: 0 }, close: { day: 3, hour: 18, minute: 0 } }],
      TZ,
    );
    expect(hours!.days.find((d) => d.weekday === 3)?.intervals).toEqual([{ start: 540, end: 1080 }]);
  });
});

describe('open / closed state', () => {
  const hours = parseOpeningHours('Mo-Fr 09:00-18:30; Sa 09:00-14:00; Su off', TZ);

  it('reports open during opening hours, with the closing time', () => {
    const status = getOpeningStatus(hours, WED_10);
    expect(status.state).toBe('open');
    expect(status.detail).toBe('Closes 18:30');
  });

  it('reports closed after hours, with the next opening', () => {
    const status = getOpeningStatus(hours, WED_20);
    expect(status.state).toBe('closed');
    expect(status.detail).toMatch(/Opens tomorrow 09:00/);
  });

  it('reports closed on a closed day and looks ahead', () => {
    const status = getOpeningStatus(hours, SUN_12);
    expect(status.state).toBe('closed');
    expect(status.detail).toMatch(/Opens tomorrow 09:00/);
  });

  it('never guesses when hours are unknown', () => {
    const status = getOpeningStatus(null, WED_10);
    expect(status.state).toBe('unknown');
    expect(status.detail).toBeNull();
  });

  it('marks a partially parsed schedule as partial', () => {
    const partial = parseOpeningHours('Mo-Fr 09:00-17:00; PH off', TZ);
    expect(getOpeningStatus(partial, WED_10).partial).toBe(true);
  });

  it('renders a Monday-first weekly schedule', () => {
    const rows = weeklySchedule(hours, WED_10);
    expect(rows.map((r) => r.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(rows.find((r) => r.label === 'Sun')?.text).toBe('Closed');
    expect(rows.find((r) => r.isToday)?.label).toBe('Wed');
  });
});
