import Link from 'next/link';
import { buildQueryString } from '@/lib/list-query';

/** A column header that toggles sort direction, preserving other filters. */
export function SortLink({
  field,
  label,
  searchParams,
}: {
  field: string;
  label: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const currentSort = single(searchParams.sort);
  const currentDir = single(searchParams.dir) === 'desc' ? 'desc' : 'asc';
  const active = currentSort === field;
  const nextDir = active && currentDir === 'asc' ? 'desc' : 'asc';
  const query = buildQueryString(searchParams, { sort: field, dir: nextDir, page: '1' });

  return (
    <Link
      href={`?${query}`}
      className="inline-flex items-center gap-1 hover:text-ink"
      aria-label={`Sort by ${label}, ${nextDir}ending`}
    >
      {label}
      <span aria-hidden="true" className={active ? 'text-ink' : 'text-ink-muted/40'}>
        {active ? (currentDir === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </Link>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
