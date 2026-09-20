'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { WEBSITE_STATUS_LABELS, type LeadStatusDefinition, type WebsiteStatus } from '@/lib/types';
import { buttonQuiet, buttonSecondary, inputClass } from './ui';

const WEBSITE_STATUSES = Object.keys(WEBSITE_STATUS_LABELS) as WebsiteStatus[];

interface UserOption {
  id: string;
  name: string;
}

/**
 * Filter bar. Every control writes to the URL, so a filtered view is a link
 * that can be shared with a colleague and survives a refresh.
 */
export function TableFilters({
  scope,
  statuses,
  users,
  categories,
  total,
}: {
  scope: 'pool' | 'leads';
  statuses: LeadStatusDefinition[];
  users: UserOption[];
  categories: Array<{ key: string; label: string }>;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  function update(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    startTransition(() => router.push(`?${params.toString()}`));
  }

  const activeCount = [...searchParams.keys()].filter((k) => !['sort', 'dir', 'page'].includes(k)).length;

  return (
    <div className="border-b border-line px-4 py-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: search.trim() || null });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[200px] flex-1">
          <label htmlFor="filter-search" className="block text-xs font-medium text-ink-soft">
            Search
          </label>
          <input
            id="filter-search"
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, street, city, postcode or phone"
          />
        </div>

        <div>
          <label htmlFor="filter-website" className="block text-xs font-medium text-ink-soft">
            Website status
          </label>
          <select
            id="filter-website"
            className={inputClass}
            value={searchParams.get('website') ?? ''}
            onChange={(event) => update({ website: event.target.value || null })}
          >
            <option value="">Any</option>
            {WEBSITE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {WEBSITE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {scope === 'leads' && (
          <>
            <div>
              <label htmlFor="filter-status" className="block text-xs font-medium text-ink-soft">
                Lead status
              </label>
              <select
                id="filter-status"
                className={inputClass}
                value={searchParams.get('status') ?? ''}
                onChange={(event) => update({ status: event.target.value || null })}
              >
                <option value="">Any</option>
                {statuses.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-assigned" className="block text-xs font-medium text-ink-soft">
                Assigned to
              </label>
              <select
                id="filter-assigned"
                className={inputClass}
                value={searchParams.get('assigned') ?? ''}
                onChange={(event) => update({ assigned: event.target.value || null })}
              >
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label htmlFor="filter-category" className="block text-xs font-medium text-ink-soft">
            Category
          </label>
          <select
            id="filter-category"
            className={inputClass}
            value={searchParams.get('category') ?? ''}
            onChange={(event) => update({ category: event.target.value || null })}
          >
            <option value="">Any</option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={buttonSecondary} disabled={pending}>
          Apply
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <Toggle label="Qualifies as a no-website lead" param="qualified" searchParams={searchParams} onToggle={update} />
        <Toggle label="Needs manual check" param="manual" searchParams={searchParams} onToggle={update} />
        <Toggle label="Open right now" param="openNow" searchParams={searchParams} onToggle={update} />
        {scope === 'leads' && (
          <>
            <Toggle label="Not called yet" param="uncalled" searchParams={searchParams} onToggle={update} />
            <Toggle label="Callback due" param="callback" searchParams={searchParams} onToggle={update} />
          </>
        )}
        <Toggle label="Show excluded" param="excluded" searchParams={searchParams} onToggle={update} />

        <span className="ml-auto text-ink-soft">
          {total} {total === 1 ? 'row' : 'rows'}
          {activeCount > 0 && (
            <button type="button" className={`${buttonQuiet} ml-2`} onClick={() => startTransition(() => router.push('?'))}>
              Clear filters
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  param,
  searchParams,
  onToggle,
}: {
  label: string;
  param: string;
  searchParams: URLSearchParams;
  onToggle: (changes: Record<string, string | null>) => void;
}) {
  const active = searchParams.get(param) === '1';
  return (
    <label className="inline-flex items-center gap-1.5 text-ink-soft">
      <input type="checkbox" checked={active} onChange={() => onToggle({ [param]: active ? null : '1' })} />
      {label}
    </label>
  );
}
