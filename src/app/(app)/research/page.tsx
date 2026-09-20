import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/current-user';
import { CATEGORIES } from '@/lib/discovery/categories';
import { describeProviders } from '@/lib/providers/registry';
import { listRuns } from '@/lib/repo/research';
import { ResearchPanel } from '@/components/research-panel';
import { Badge, Card, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Research' };

export const dynamic = 'force-dynamic';

export default async function ResearchPage() {
  await requireUser();
  const providers = describeProviders();
  const runs = listRuns(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Research</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Discovery fills the research pool. Businesses only become leads when you promote them.
        </p>
      </div>

      <ResearchPanel
        categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
        searchProviderAvailable={providers.search.isAvailable}
        searchProviderReason={providers.search.unavailableReason}
      />

      <Card title="Recent research runs" description="Every run is recorded with what it searched and what it found.">
        {runs.length === 0 ? (
          <EmptyState title="No research yet">
            Start with a quick lead list above, or type a command such as “Find 20 barbers around Gießen”.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th scope="col" className="px-4 py-2 font-medium">Location</th>
                  <th scope="col" className="px-4 py-2 font-medium">Radius</th>
                  <th scope="col" className="px-4 py-2 font-medium">Category</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">New</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Verified</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Qualifying</th>
                  <th scope="col" className="px-4 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium text-ink">{run.locationLabel}</div>
                      {run.queryText && <div className="text-xs text-ink-muted">“{run.queryText}”</div>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{run.radiusKm} km</td>
                    <td className="px-4 py-2">{run.category ?? 'Any'}</td>
                    <td className="px-4 py-2">
                      <Badge
                        tone={
                          run.status === 'completed'
                            ? 'good'
                            : run.status === 'failed'
                              ? 'bad'
                              : run.status === 'partial'
                                ? 'warn'
                                : 'info'
                        }
                        title={run.error ?? undefined}
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{run.stats?.newBusinesses ?? 0}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{run.stats?.verified ?? 0}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{run.stats?.qualified ?? 0}</td>
                    <td className="px-4 py-2 text-xs text-ink-soft">{formatDateTime(run.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
