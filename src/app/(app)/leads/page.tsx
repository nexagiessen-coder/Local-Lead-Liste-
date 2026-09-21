import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { CATEGORIES } from '@/lib/discovery/categories';
import { applyOpenNow, parseListQuery } from '@/lib/list-query';
import { countBusinessRows, listBusinessRows, listLeadStatuses } from '@/lib/repo/leads';
import { listUsers } from '@/lib/repo/users';
import { BusinessTable } from '@/components/business-table';
import { TableFilters } from '@/components/table-filters';
import { Pagination } from '@/components/pagination';
import { Card, buttonPrimary } from '@/components/ui';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Leads' };

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const query = parseListQuery('leads', params);

  const [businessRows, total, statuses, users] = await Promise.all([
    listBusinessRows(query.filters),
    countBusinessRows(query.filters),
    listLeadStatuses(),
    listUsers(false),
  ]);
  const rows = applyOpenNow(businessRows, query.openNow);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Active leads</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Businesses your team has qualified and is working. Calling never removes a lead from this list.
          </p>
        </div>
        <Link href="/call" className={buttonPrimary}>
          Start calling
        </Link>
      </div>

      <Card>
        <TableFilters
          scope="leads"
          statuses={statuses}
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
          total={total}
        />
        <BusinessTable rows={rows} scope="leads" statuses={statuses} searchParams={params} />
        <Pagination page={query.page} pageSize={query.pageSize} total={total} searchParams={params} />
      </Card>
    </div>
  );
}
