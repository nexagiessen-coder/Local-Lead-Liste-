import { requireUser } from '@/lib/auth/current-user';
import { CATEGORIES } from '@/lib/discovery/categories';
import { applyOpenNow, parseListQuery } from '@/lib/list-query';
import { countBusinessRows, listBusinessRows, listLeadStatuses } from '@/lib/repo/leads';
import { listUsers } from '@/lib/repo/users';
import { BusinessTable } from '@/components/business-table';
import { TableFilters } from '@/components/table-filters';
import { Pagination } from '@/components/pagination';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const params = await searchParams;
  const query = parseListQuery('pool', params);

  const rows = applyOpenNow(listBusinessRows(query.filters), query.openNow);
  const total = countBusinessRows(query.filters);
  const statuses = listLeadStatuses();
  const users = listUsers(false);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Research pool</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Everything discovered so far, including businesses that already have a website, uncertain results and
          entries that need a manual check. Nothing here is a lead until you promote it.
        </p>
      </div>

      <Card>
        <TableFilters
          scope="pool"
          statuses={statuses}
          users={users.map((u) => ({ id: u.id, name: u.name }))}
          categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
          total={total}
        />
        <BusinessTable rows={rows} scope="pool" statuses={statuses} searchParams={params} />
        <Pagination page={query.page} pageSize={query.pageSize} total={total} searchParams={params} />
      </Card>
    </div>
  );
}
