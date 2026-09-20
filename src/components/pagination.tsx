import Link from 'next/link';
import { buildQueryString } from '@/lib/list-query';
import { buttonSecondary } from './ui';

export function Pagination({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <p className="text-ink-soft">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={`?${buildQueryString(searchParams, { page: String(page - 1) })}`} className={buttonSecondary}>
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link href={`?${buildQueryString(searchParams, { page: String(page + 1) })}`} className={buttonSecondary}>
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
