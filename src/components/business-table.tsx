import Link from 'next/link';
import { getOpeningStatus } from '@/lib/hours/status';
import { formatPhone, formatRelative, manualSearchUrl } from '@/lib/format';
import type { LeadRow } from '@/lib/repo/leads';
import type { LeadStatusDefinition } from '@/lib/types';
import { qualificationShortLabel } from '@/lib/qualification/qualify';
import { Badge, EmptyState, Value, buttonQuiet } from './ui';
import { DemoBadge, IdentityBadge, LeadStatusBadge, OpenStateBadge, WebsiteStatusBadge } from './status';
import { CallButton } from './call-button';
import { SortLink } from './sort-link';

/**
 * The main spreadsheet-style table.
 *
 * Rendered on the server: the whole table is plain HTML, which keeps it fast
 * with thousands of rows and keyboard-navigable by default.
 */
export function BusinessTable({
  rows,
  scope,
  statuses,
  searchParams,
  selectedId,
}: {
  rows: LeadRow[];
  scope: 'pool' | 'leads';
  statuses: LeadStatusDefinition[];
  searchParams: Record<string, string | string[] | undefined>;
  selectedId?: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState title={scope === 'leads' ? 'No leads match these filters' : 'No businesses match these filters'}>
        {scope === 'leads'
          ? 'Promote a verified business from the research pool to start calling.'
          : 'Run a research query, or clear the filters above.'}
      </EmptyState>
    );
  }

  return (
    <div className="table-scroll">
      <table className="table-wide w-full border-collapse text-sm">
        <caption className="sr-only">
          {scope === 'leads' ? 'Active leads' : 'Researched businesses'}, {rows.length} rows
        </caption>
        <thead>
          <tr className="border-b border-line bg-subtle text-left text-xs text-ink-soft">
            <th scope="col" className="px-3 py-2 font-medium">
              <SortLink field="name" label="Business" searchParams={searchParams} />
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              <SortLink field="category" label="Category" searchParams={searchParams} />
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              <SortLink field="city" label="City" searchParams={searchParams} />
            </th>
            <th scope="col" className="px-3 py-2 font-medium">Address</th>
            <th scope="col" className="px-3 py-2 font-medium">Phone</th>
            <th scope="col" className="px-3 py-2 font-medium">
              <SortLink field="website" label="Website status" searchParams={searchParams} />
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              <SortLink field="identity" label="Identity" searchParams={searchParams} />
            </th>
            <th scope="col" className="px-3 py-2 font-medium">Open</th>
            {scope === 'leads' && (
              <>
                <th scope="col" className="px-3 py-2 font-medium">
                  <SortLink field="lastCall" label="Last call" searchParams={searchParams} />
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <SortLink field="callCount" label="Calls" searchParams={searchParams} />
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  <SortLink field="leadStatus" label="Lead status" searchParams={searchParams} />
                </th>
                <th scope="col" className="px-3 py-2 font-medium">Assigned</th>
              </>
            )}
            {scope === 'pool' && <th scope="col" className="px-3 py-2 font-medium">Qualifies</th>}
            <th scope="col" className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ business, lead, assignedUserName, qualification }) => {
            const opening = getOpeningStatus(business.openingHours);
            const isSelected = selectedId === business.id;
            const detailHref = `/business/${business.id}`;
            return (
              <tr
                key={business.id}
                className={`border-b border-line align-top last:border-0 hover:bg-subtle ${
                  isSelected ? 'bg-accent-soft' : ''
                } ${business.excludedAt ? 'opacity-60' : ''}`}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <Link
                    href={detailHref}
                    className="block max-w-[22ch] truncate font-medium text-ink underline-offset-2 hover:underline"
                    title={business.name}
                  >
                    {business.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {business.isDemoData && <DemoBadge />}
                    {business.excludedAt && <Badge tone="bad">Excluded</Badge>}
                    {business.websiteUrl && (
                      <a
                        href={business.websiteUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs text-info underline-offset-2 hover:underline"
                      >
                        {new URL(business.websiteUrl).hostname.replace(/^www\./, '')}
                      </a>
                    )}
                  </div>
                </th>
                <td className="px-3 py-2 text-ink-soft">
                  <Value>{business.categoryLabel ?? business.category}</Value>
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  <Value>{business.city}</Value>
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  <div className="max-w-[16ch] truncate" title={[business.street, business.houseNumber, business.postalCode].filter(Boolean).join(' ')}>
                    <Value unknownLabel="No address">
                      {[business.street, business.houseNumber].filter(Boolean).join(' ') || null}
                    </Value>
                  </div>
                  {business.postalCode && <div className="text-xs text-ink-muted">{business.postalCode}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {business.phoneE164 ? (
                    <a href={`tel:${business.phoneE164}`} className="text-ink underline-offset-2 hover:underline">
                      {formatPhone(business.phoneE164)}
                    </a>
                  ) : (
                    <Value unknownLabel="No phone">{null}</Value>
                  )}
                </td>
                <td className="px-3 py-2">
                  <WebsiteStatusBadge status={business.websiteStatus} confidence={business.websiteConfidence} />
                </td>
                <td className="px-3 py-2">
                  <IdentityBadge status={business.identityStatus} confidence={business.identityConfidence} compact />
                </td>
                <td className="px-3 py-2">
                  <OpenStateBadge state={opening.state} detail={opening.detail} compact />
                </td>
                {scope === 'leads' && (
                  <>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-soft">
                      {formatRelative(lead?.lastCallAt ?? null)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{lead?.callCount ?? 0}</td>
                    <td className="px-3 py-2">
                      {lead ? <LeadStatusBadge status={lead.status} statuses={statuses} /> : null}
                      {lead?.nextCallbackAt ? (
                        <div className="mt-0.5 text-xs text-warn">Callback {formatRelative(lead.nextCallbackAt)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      <Value unknownLabel="Unassigned">{assignedUserName}</Value>
                    </td>
                  </>
                )}
                {scope === 'pool' && (
                  <td className="px-3 py-2">
                    <Badge
                      tone={qualification.qualifies ? 'good' : 'neutral'}
                      title={
                        qualification.qualifies
                          ? qualification.reasons.join(' ')
                          : qualification.blockers.join(' ')
                      }
                    >
                      {qualificationShortLabel(qualification)}
                    </Badge>
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    {lead && <CallButton leadId={lead.id} phoneE164={business.phoneE164} />}
                    <a
                      href={manualSearchUrl(business.name, business.city)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={buttonQuiet}
                      title={`Search Google for "${business.name} ${business.city ?? ''}" in a new tab`}
                    >
                      Verify manually ↗
                    </a>
                    <Link href={detailHref} className={buttonQuiet}>
                      Details
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
