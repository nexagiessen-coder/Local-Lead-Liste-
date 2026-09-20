import { getOpeningStatus } from '@/lib/hours/status';
import type { ListFilters, LeadRow, ListScope } from '@/lib/repo/leads';

/**
 * Translation between URL query parameters and list filters.
 *
 * Filters live in the URL so a filtered view can be linked, bookmarked and
 * shared with a colleague, and so the back button behaves.
 */

export interface ListQuery {
  filters: ListFilters;
  /** Applied after the SQL query because it depends on the current time. */
  openNow: boolean;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE = 50;

export function parseListQuery(
  scope: ListScope,
  searchParams: Record<string, string | string[] | undefined>,
): ListQuery {
  const get = (key: string): string | undefined => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const list = (key: string): string[] | undefined => {
    const value = get(key);
    if (!value) return undefined;
    const parts = value.split(',').map((v) => v.trim()).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  };

  const page = Math.max(1, Number.parseInt(get('page') ?? '1', 10) || 1);

  return {
    filters: {
      scope,
      search: get('q')?.trim() || undefined,
      websiteStatus: list('website'),
      identityStatus: list('identity'),
      leadStatus: list('status'),
      assignedUserId: get('assigned') || undefined,
      category: get('category') || undefined,
      city: get('city') || undefined,
      qualifiedOnly: get('qualified') === '1',
      needsManualCheck: get('manual') === '1',
      uncalled: get('uncalled') === '1',
      callbackDue: get('callback') === '1',
      includeExcluded: get('excluded') === '1',
      sort: get('sort'),
      direction: get('dir') === 'desc' ? 'desc' : 'asc',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    },
    openNow: get('openNow') === '1',
    page,
    pageSize: PAGE_SIZE,
  };
}

/** Time-dependent filter, applied to the rows the database returned. */
export function applyOpenNow(rows: LeadRow[], openNow: boolean): LeadRow[] {
  if (!openNow) return rows;
  return rows.filter((row) => getOpeningStatus(row.business.openingHours).state === 'open');
}

export function buildQueryString(
  current: Record<string, string | string[] | undefined>,
  changes: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) params.set(key, single);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  // A filter change always returns to the first page.
  if (!('page' in changes)) params.delete('page');
  return params.toString();
}
