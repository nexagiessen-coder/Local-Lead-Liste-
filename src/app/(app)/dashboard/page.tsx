import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { callingQueue, leadCounts, listLeadStatuses } from '@/lib/repo/leads';
import { callsSince, teamActivity } from '@/lib/repo/calls';
import { recentActivity } from '@/lib/repo/audit';
import { listRuns } from '@/lib/repo/research';
import { describeProviders } from '@/lib/providers/registry';
import { DAY } from '@/lib/time';
import { formatPhone, formatRelative } from '@/lib/format';
import { Alert, Card, EmptyState, Stat, buttonSecondary } from '@/components/ui';
import { LeadStatusBadge } from '@/components/status';

export const metadata: Metadata = { title: 'Dashboard' };

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const [counts, callsToday, queue, team, activity, runs, statuses] = await Promise.all([
    leadCounts(),
    callsSince(Date.now() - DAY),
    callingQueue(user.id, 10),
    teamActivity(),
    recentActivity(12),
    listRuns(3),
    listLeadStatuses(),
  ]);
  const providers = describeProviders();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Good to see you, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {queue.length > 0
              ? `${queue.length} lead${queue.length === 1 ? ' is' : 's are'} waiting in your calling queue.`
              : 'Your calling queue is empty. Research or promote some businesses to get started.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/research" className={buttonSecondary}>
            New research
          </Link>
          <Link href="/call" className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink">
            Start calling
          </Link>
        </div>
      </div>

      {!providers.search.isAvailable && (
        <Alert tone="warn" title="Website verification is running with one channel missing">
          {providers.search.unavailableReason} Until a search provider is configured, businesses are marked{' '}
          <strong>Requires manual check</strong> rather than “no website”.
        </Alert>
      )}

      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Businesses researched" value={counts.researched} hint="In the research pool" />
        <Stat label="Qualified prospects" value={counts.qualified} tone="good" hint="Verified no website, callable" />
        <Stat label="Active leads" value={counts.leads} hint={`${counts.callable} ready to call`} />
        <Stat label="Needs manual check" value={counts.manualCheck} tone="warn" hint="Uncertain or incomplete research" />
        <Stat label="Calls in the last 24h" value={callsToday} />
        <Stat label="Callbacks scheduled" value={counts.callbacks} tone="info" />
        <Stat label="Interested" value={counts.interested} tone="good" />
        <Stat label="Converted" value={counts.converted} tone="good" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Today's calling queue"
          description="Callbacks first, then your own leads."
          action={
            <Link href="/call" className={buttonSecondary}>
              Open queue
            </Link>
          }
        >
          {queue.length === 0 ? (
            <EmptyState title="Nothing queued">
              Promote verified businesses from the{' '}
              <Link href="/pool?qualified=1" className="underline underline-offset-2">
                research pool
              </Link>
              .
            </EmptyState>
          ) : (
            <ol className="divide-y divide-line">
              {queue.map((row) => (
                <li key={row.business.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                  <Link href={`/call?lead=${row.lead?.id}`} className="min-w-0 flex-1 font-medium text-ink hover:underline">
                    {row.business.name}
                  </Link>
                  <span className="text-xs text-ink-soft">{row.business.city}</span>
                  <span className="font-mono text-xs text-ink-soft">{formatPhone(row.business.phoneE164)}</span>
                  {row.lead && <LeadStatusBadge status={row.lead.status} statuses={statuses} />}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Team activity" description="Calls and assignments per person.">
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th scope="col" className="px-4 py-2 font-medium">Person</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Calls (24h)</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Calls (7d)</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Leads assigned</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.userId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink">{member.userName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{member.callsToday}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{member.callsWeek}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{member.leadsAssigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent activity" description="Every state change is recorded with who did it.">
          {activity.length === 0 ? (
            <EmptyState title="Nothing has happened yet" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2">
                  <span className="font-medium text-ink">{entry.userName ?? 'System'}</span>
                  <span className="text-ink-soft">{entry.action.replace(/[._]/g, ' ')}</span>
                  <span className="ml-auto text-xs text-ink-muted">{formatRelative(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent research" action={<Link href="/research" className={buttonSecondary}>Research</Link>}>
          {runs.length === 0 ? (
            <EmptyState title="No research runs yet" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {runs.map((run) => (
                <li key={run.id} className="px-4 py-2">
                  <p className="font-medium text-ink">
                    {run.locationLabel} · {run.radiusKm} km · {run.category ?? 'any'}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {run.stats?.newBusinesses ?? 0} new · {run.stats?.qualified ?? 0} qualifying ·{' '}
                    {formatRelative(run.startedAt)} · {run.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
