import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { callingQueue, listLeadStatuses } from '@/lib/repo/leads';
import { getBusiness } from '@/lib/repo/businesses';
import { getOpeningStatus } from '@/lib/hours/status';
import { formatPhone, formatRelative } from '@/lib/format';
import { BusinessDetail } from '@/components/business-detail';
import { CallButton } from '@/components/call-button';
import { LeadStatusBadge, OpenStateBadge, WebsiteStatusBadge } from '@/components/status';
import { Card, EmptyState, buttonSecondary } from '@/components/ui';

export const metadata: Metadata = { title: 'Call queue' };

export const dynamic = 'force-dynamic';

/**
 * The calling workspace.
 *
 * The current lead never disappears on its own. Calling it records an attempt
 * and leaves it on screen; moving on is an explicit "Next lead" click, so the
 * caller always knows exactly which business they just dialled.
 */
export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = typeof params.lead === 'string' ? params.lead : undefined;

  const [queue, statuses] = await Promise.all([callingQueue(user.id, 50), listLeadStatuses()]);
  const currentIndex = requested ? Math.max(0, queue.findIndex((row) => row.lead?.id === requested)) : 0;
  const current = queue[currentIndex];
  const next = queue[currentIndex + 1];
  const business = current ? await getBusiness(current.business.id) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Call queue</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {queue.length} lead{queue.length === 1 ? '' : 's'} ready to call. Callbacks that are due come first, then
            your own leads.
          </p>
        </div>
        {next?.lead && (
          <Link href={`/call?lead=${next.lead.id}`} className={buttonSecondary}>
            Next lead →
          </Link>
        )}
      </div>

      {!current || !business ? (
        <Card>
          <EmptyState title="Nothing to call right now">
            Promote a verified business from the{' '}
            <Link href="/pool?qualified=1" className="underline underline-offset-2">
              research pool
            </Link>{' '}
            to fill the queue. Leads with a terminal status or without a phone number are not queued.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-xs text-ink-soft">
                  Lead {currentIndex + 1} of {queue.length}
                </p>
                <h2 className="text-xl font-semibold text-ink">{business.name}</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {[business.street, business.houseNumber].filter(Boolean).join(' ')}
                  {business.city ? `, ${business.postalCode ?? ''} ${business.city}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <WebsiteStatusBadge status={business.websiteStatus} confidence={business.websiteConfidence} />
                  <OpenStateBadge
                    state={getOpeningStatus(business.openingHours).state}
                    detail={getOpeningStatus(business.openingHours).detail}
                  />
                  {current.lead && <LeadStatusBadge status={current.lead.status} statuses={statuses} />}
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg text-ink">{formatPhone(business.phoneE164) ?? 'No phone'}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {current.lead?.callCount ?? 0} previous attempt(s) · last {formatRelative(current.lead?.lastCallAt ?? null)}
                </p>
                <div className="mt-2 flex justify-end">
                  {current.lead && (
                    <CallButton leadId={current.lead.id} phoneE164={business.phoneE164} label="Call now" size="lg" />
                  )}
                </div>
              </div>
            </div>
          </Card>

          <BusinessDetail business={business} user={user} />
        </>
      )}

      {queue.length > 1 && (
        <Card title="Up next" description="The order updates as calls are recorded.">
          <ol className="divide-y divide-line">
            {queue.slice(0, 15).map((row, index) => (
              <li key={row.business.id} className={`flex flex-wrap items-center gap-3 px-4 py-2 text-sm ${index === currentIndex ? 'bg-accent-soft' : ''}`}>
                <span className="w-6 text-xs text-ink-muted tabular-nums">{index + 1}</span>
                <Link href={`/call?lead=${row.lead?.id}`} className="min-w-0 flex-1 font-medium text-ink hover:underline">
                  {row.business.name}
                </Link>
                <span className="text-xs text-ink-soft">{row.business.city}</span>
                <span className="font-mono text-xs text-ink-soft">{formatPhone(row.business.phoneE164)}</span>
                {row.lead?.nextCallbackAt && (
                  <span className="text-xs text-warn">callback {formatRelative(row.lead.nextCallbackAt)}</span>
                )}
                <span className="text-xs text-ink-muted">{row.assignedUserName ?? 'unassigned'}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
