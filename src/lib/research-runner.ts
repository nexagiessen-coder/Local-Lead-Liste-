import { runResearch, type ResearchRequest, type ResearchOutcome } from '@/lib/discovery/pipeline';
import { createProviderSet } from '@/lib/providers/registry';
import { EMPTY_STATS, createRun, finishRun, getRun } from '@/lib/repo/research';
import { recordAudit } from '@/lib/repo/audit';

/**
 * In-process research job manager.
 *
 * A run makes many network round-trips and can take minutes, so it is started
 * in the background and the browser polls the run record. The database is the
 * source of truth for progress; this map only tracks in-flight work so one user
 * cannot start several runs at once and so a crash is always written back.
 *
 * This relies on the single long-lived Node process the app is designed for.
 */
const inFlight = new Map<string, Promise<ResearchOutcome>>();
const activeByUser = new Map<string, string>();

export class ResearchBusyError extends Error {
  readonly runId: string;
  constructor(runId: string) {
    super('A research run is already in progress. Wait for it to finish before starting another.');
    this.name = 'ResearchBusyError';
    this.runId = runId;
  }
}

export function activeRunFor(userId: string): string | null {
  const runId = activeByUser.get(userId);
  if (!runId) return null;
  if (!inFlight.has(runId)) {
    activeByUser.delete(userId);
    return null;
  }
  return runId;
}

export function isRunning(runId: string): boolean {
  return inFlight.has(runId);
}

/** Creates the run row, kicks off the pipeline, and returns the id immediately. */
export function startResearch(request: ResearchRequest): { runId: string } {
  const existing = activeRunFor(request.userId);
  if (existing) throw new ResearchBusyError(existing);

  const providers = createProviderSet();
  const runId = createRun({
    createdBy: request.userId,
    queryText: request.queryText ?? null,
    locationLabel: request.locationQuery,
    centerLat: null,
    centerLon: null,
    radiusKm: request.radiusKm,
    category: request.category,
    requestedCount: request.desiredCount,
    provider: providers.discovery.info.id,
  });

  const work = runResearch({ ...request, runId }, providers)
    .then((outcome) => {
      recordAudit({
        userId: request.userId,
        action: 'research.completed',
        entityType: 'research_run',
        entityId: runId,
        detail: { stats: outcome.stats, status: outcome.status, location: outcome.locationLabel },
      });
      return outcome;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const run = getRun(runId);
      if (run && run.status === 'running') {
        finishRun(runId, 'failed', run.stats ?? EMPTY_STATS, message);
      }
      throw error;
    })
    .finally(() => {
      inFlight.delete(runId);
      if (activeByUser.get(request.userId) === runId) activeByUser.delete(request.userId);
    });

  // The promise is tracked, not awaited; a rejection is already handled above.
  work.catch(() => undefined);
  inFlight.set(runId, work);
  activeByUser.set(request.userId, runId);

  return { runId };
}
