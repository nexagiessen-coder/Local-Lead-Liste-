import { getOpeningStatus, weeklySchedule } from '@/lib/hours/status';
import type { OpeningHours } from '@/lib/types';
import { Alert } from './ui';
import { OpenStateBadge } from './status';

/**
 * Opening hours.
 *
 * Hours are shown exactly as the source provided them. Anything that could not
 * be parsed is displayed verbatim and clearly marked as unverified, rather than
 * being filled in with a plausible guess.
 */
export function OpeningHoursPanel({
  hours,
  source,
  verifiedAt,
}: {
  hours: OpeningHours | null;
  source: string | null;
  verifiedAt: number | null;
}) {
  const status = getOpeningStatus(hours);
  const schedule = weeklySchedule(hours);

  if (!hours || schedule.length === 0) {
    return (
      <div className="px-4 py-3">
        <OpenStateBadge state="unknown" detail={null} />
        <p className="mt-2 text-sm text-ink-soft">
          No opening hours are available from a verified source for this business. They are never invented.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <OpenStateBadge state={status.state} detail={status.detail} />
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Weekly opening hours</caption>
        <tbody>
          {schedule.map((row) => (
            <tr key={row.weekday} className={row.isToday ? 'font-medium text-ink' : 'text-ink-soft'}>
              <th scope="row" className="py-0.5 pr-4 text-left font-normal">
                {row.label}
                {row.isToday && <span className="ml-1 text-xs text-accent">today</span>}
              </th>
              <td className="py-0.5 tabular-nums">{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-xs text-ink-muted">
        Times are shown in {hours.timezone}.{source && ` Source: ${source}.`}
        {verifiedAt && ` Last confirmed ${new Date(verifiedAt).toLocaleDateString('en-GB')}.`}
      </p>

      {hours.unparsed.length > 0 && (
        <div className="mt-2">
          <Alert tone="warn" title="Part of the hours could not be read">
            <p>These rules are shown exactly as the source recorded them and are not applied above:</p>
            <ul className="mt-1 list-disc pl-4 font-mono text-xs">
              {hours.unparsed.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
    </div>
  );
}
