'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_COUNT,
  DEFAULT_RADIUS_KM,
  MAX_COUNT,
  MAX_RADIUS_KM,
  defaultSuggestions,
  filterCommandToQuery,
  parseCommand,
  type ParsedCommand,
} from '@/lib/command/parse';
import type { ResearchRun, ResearchRunStats } from '@/lib/types';
import { Alert, Card, FieldLabel, buttonPrimary, buttonSecondary, inputClass } from '@/components/ui';

interface CategoryOption {
  key: string;
  label: string;
}

interface RunResponse {
  run: ResearchRun;
  running: boolean;
  items: Array<{
    id: string;
    raw_name: string;
    outcome: string;
    reason: string | null;
    name: string | null;
    city: string | null;
    website_status: string | null;
    business_id: string | null;
  }>;
}

const POLL_INTERVAL_MS = 1500;

export function ResearchPanel({
  categories,
  searchProviderAvailable,
  searchProviderReason,
}: {
  categories: CategoryOption[];
  searchProviderAvailable: boolean;
  searchProviderReason: string | null;
}) {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [category, setCategory] = useState<string>('');
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [onlyNew, setOnlyNew] = useState(true);
  const [command, setCommand] = useState('');
  const [preview, setPreview] = useState<ParsedCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/research/${runId}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as RunResponse;
        if (cancelled) return;
        setRunState(data);
        if (!data.running) {
          stopPolling();
          setSubmitting(false);
          router.refresh();
        }
      } catch {
        // Transient fetch failures are ignored; the next tick retries.
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [runId, router, stopPolling]);

  async function start(request: {
    location: string;
    radiusKm: number;
    category: string | null;
    count: number;
    onlyNew: boolean;
    queryText: string | null;
  }) {
    setError(null);
    setSubmitting(true);
    setRunState(null);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = (await response.json()) as { runId?: string; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Research could not be started.');
        setSubmitting(false);
        if (data.runId) setRunId(data.runId);
        return;
      }
      setRunId(data.runId ?? null);
    } catch {
      setError('Could not reach the server.');
      setSubmitting(false);
    }
  }

  function onQuickSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (location.trim().length < 2) {
      setError('Enter a city or place to research.');
      return;
    }
    void start({
      location: location.trim(),
      radiusKm,
      category: category === '' ? null : category,
      count,
      onlyNew,
      queryText: null,
    });
  }

  function onCommandChange(value: string) {
    setCommand(value);
    setPreview(value.trim().length >= 3 ? parseCommand(value) : null);
  }

  function onCommandSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseCommand(command);
    setPreview(parsed);
    if (parsed.kind === 'research') {
      void start({
        location: parsed.location,
        radiusKm: parsed.radiusKm,
        category: parsed.category,
        count: parsed.count,
        onlyNew: true,
        queryText: command.trim(),
      });
      return;
    }
    if (parsed.kind === 'filter') {
      const query = filterCommandToQuery(parsed);
      router.push(`/${parsed.scope}${query ? `?${query}` : ''}`);
      return;
    }
    setError(parsed.explanation);
  }

  const stats = runState?.run.stats ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Quick lead list" description="Research a place and niche. Nothing becomes a lead automatically.">
        <form onSubmit={onQuickSubmit} className="space-y-4 p-4">
          <div>
            <FieldLabel htmlFor="location">Location</FieldLabel>
            <input
              id="location"
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Gießen"
              required
              minLength={2}
            />
            <p className="mt-1 text-xs text-ink-muted">
              A city search is not limited to the city boundary — the radius below decides the area.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="radius">Radius (km)</FieldLabel>
              <input
                id="radius"
                type="number"
                min={1}
                max={MAX_RADIUS_KM}
                className={inputClass}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
              />
            </div>
            <div>
              <FieldLabel htmlFor="category">Niche</FieldLabel>
              <select id="category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Any business</option>
                {categories.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="count">New leads wanted</FieldLabel>
              <input
                id="count"
                type="number"
                min={1}
                max={MAX_COUNT}
                className={inputClass}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={onlyNew}
              onChange={(e) => setOnlyNew(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Only new businesses — skip anything already researched, contacted, dismissed or in the lead list.
            </span>
          </label>

          {error && <Alert tone="bad">{error}</Alert>}

          <button type="submit" className={buttonPrimary} disabled={submitting}>
            {submitting ? 'Researching…' : 'Find new leads'}
          </button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card title="Command" description="Type a request in plain English or German.">
          <form onSubmit={onCommandSubmit} className="space-y-3 p-4">
            <label htmlFor="command" className="sr-only">
              Command
            </label>
            <input
              id="command"
              className={inputClass}
              value={command}
              onChange={(e) => onCommandChange(e.target.value)}
              placeholder="Find 20 barbers around Gießen"
            />
            {preview && (
              <div className="rounded-md border border-line bg-subtle px-3 py-2 text-xs text-ink-soft">
                <p className="font-medium text-ink">{preview.explanation}</p>
                {preview.kind === 'research' && preview.assumptions.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {preview.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                )}
                {preview.kind === 'unknown' && (
                  <ul className="mt-1 list-disc pl-4">
                    {preview.suggestions.slice(0, 3).map((suggestion) => (
                      <li key={suggestion}>
                        <button
                          type="button"
                          className="underline hover:text-ink"
                          onClick={() => onCommandChange(suggestion)}
                        >
                          {suggestion}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonSecondary} disabled={submitting}>
                Run command
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Commands run the same verification pipeline as the form. They cannot skip identity or website checks.
            </p>
            <details className="text-xs text-ink-muted">
              <summary className="cursor-pointer">Examples</summary>
              <ul className="mt-1 list-disc pl-4">
                {defaultSuggestions().map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </details>
          </form>
        </Card>

        {!searchProviderAvailable && (
          <Alert tone="warn" title="Web search is not configured">
            {searchProviderReason ??
              'Without a web search provider the search channel cannot run, so no business can be confirmed as having no website.'}{' '}
            Results will be marked <strong>Requires manual check</strong> instead — by design.
          </Alert>
        )}

        {runState && (
          <Card
            title={runState.running ? 'Research in progress' : 'Research finished'}
            description={`${runState.run.locationLabel} · ${runState.run.radiusKm} km`}
          >
            <div className="space-y-3 p-4">
              {stats && <StatsGrid stats={stats} />}
              {runState.run.error && <Alert tone="warn">{runState.run.error}</Alert>}
              {!runState.running && (
                <div className="flex flex-wrap gap-2">
                  <a href="/pool" className={buttonSecondary}>
                    Open research pool
                  </a>
                  <a href="/pool?qualified=1" className={buttonPrimary}>
                    Review qualifying businesses
                  </a>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: ResearchRunStats }) {
  const entries: Array<[string, number, string]> = [
    ['Discovered', stats.discovered, 'Raw records returned by the provider.'],
    ['New businesses', stats.newBusinesses, 'Not previously in the database.'],
    ['Duplicates merged', stats.duplicates, 'Matched an existing business.'],
    ['Needs review', stats.needsReview, 'Conflicting or ambiguous identity.'],
    ['Verified', stats.verified, 'Website verification completed.'],
    ['Qualifying', stats.qualified, 'Verified no website, confirmed identity, has a phone.'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {entries.map(([label, value, hint]) => (
        <div key={label} className="rounded-md border border-line px-3 py-2" title={hint}>
          <dt className="text-xs text-ink-soft">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
