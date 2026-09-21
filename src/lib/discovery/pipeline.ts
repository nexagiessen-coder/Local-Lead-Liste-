import { getDb, one, type Db } from '@/lib/db';
import { env } from '@/lib/env';
import { buildIdentity } from '@/lib/identity/identity';
import { enrichCandidateAddress } from '@/lib/identity/enrich';
import { matchExistingBusiness } from '@/lib/identity/dedupe';
import {
  countSources,
  findBusinessBySource,
  findMatchCandidates,
  getBusiness,
  insertBusiness,
  recordSource,
  refreshBusiness,
  setIdentityStatus,
  setWebsiteStatus,
} from '@/lib/repo/businesses';
import { persistVerification, isVerificationStale } from '@/lib/repo/verifications';
import {
  EMPTY_STATS,
  cacheGeocode,
  createRun,
  finishRun,
  getCachedGeocode,
  recordRunItem,
  updateRunLocation,
  updateRunStats,
} from '@/lib/repo/research';
import { qualifyBusiness } from '@/lib/qualification/qualify';
import { verifyWebsite } from '@/lib/website/verify';
import type { ProviderSet } from '@/lib/providers/registry';
import { ProviderError, type GeocodeResult, type RawBusinessCandidate } from '@/lib/providers/types';
import type { ResearchRunStats } from '@/lib/types';
import { getCategory } from './categories';

/**
 * The research pipeline.
 *
 * Stages are kept separate and run in a fixed order:
 *   discovery → identity → deduplication → website verification → qualification
 *
 * The pipeline never creates a lead. It fills the research pool and records
 * what it found and why; promoting a business to a lead is always a human step.
 */

export interface ResearchRequest {
  locationQuery: string;
  radiusKm: number;
  category: string | null;
  /** How many *new* qualifying businesses the user asked for. */
  desiredCount: number;
  /** Quick lead list: ignore businesses already in the database. */
  onlyNew: boolean;
  userId: string;
  queryText?: string | null;
  /** Reuse a run row created by the caller, so it can be polled immediately. */
  runId?: string;
}

export interface ResearchOutcome {
  runId: string;
  stats: ResearchRunStats;
  status: 'completed' | 'partial' | 'failed';
  error: string | null;
  locationLabel: string;
}

/** Hard ceiling on verifications per run, to bound cost and time. */
const MAX_VERIFICATIONS_PER_RUN = 60;

export async function geocodeLocation(
  query: string,
  providers: ProviderSet,
  db: Db = getDb(),
): Promise<GeocodeResult | null> {
  const cached = (await getCachedGeocode(query, db)) as GeocodeResult | null;
  if (cached) return cached;
  const result = await providers.geocoding.geocode(query);
  if (result) await cacheGeocode(query, providers.geocoding.info.id, result, db);
  return result;
}

export async function runResearch(
  request: ResearchRequest,
  providers: ProviderSet,
  db: Db = getDb(),
): Promise<ResearchOutcome> {
  const stats: ResearchRunStats = { ...EMPTY_STATS };

  // The run row exists before any network call, so the UI can poll immediately.
  const runId =
    request.runId ??
    (await createRun(
      {
        createdBy: request.userId,
        queryText: request.queryText ?? null,
        locationLabel: request.locationQuery,
        centerLat: null,
        centerLon: null,
        radiusKm: request.radiusKm,
        category: request.category,
        requestedCount: request.desiredCount,
        provider: providers.discovery.info.id,
      },
      db,
    ));

  let location: GeocodeResult | null;
  try {
    location = await geocodeLocation(request.locationQuery, providers, db);
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : String(error);
    await finishRun(runId, 'failed', stats, `Location lookup failed: ${message}`, db);
    return { runId, stats, status: 'failed', error: `Location lookup failed: ${message}`, locationLabel: request.locationQuery };
  }

  if (!location) {
    const message = `Could not find a location called "${request.locationQuery}". Try a city name, or a city and country.`;
    await finishRun(runId, 'failed', stats, message, db);
    return { runId, stats, status: 'failed', error: message, locationLabel: request.locationQuery };
  }

  await updateRunLocation(runId, { label: location.label, lat: location.lat, lon: location.lon }, db);

  // --- Stage 1: discovery --------------------------------------------------
  let discovered: RawBusinessCandidate[];
  try {
    discovered = await providers.discovery.search({
      center: { lat: location.lat, lon: location.lon },
      radiusKm: request.radiusKm,
      category: request.category,
      // Over-fetch: many candidates are duplicates or fail qualification.
      limit: Math.min(200, Math.max(20, request.desiredCount * 4)),
    });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : String(error);
    await finishRun(runId, 'failed', stats, `Discovery failed: ${message}`, db);
    return { runId, stats, status: 'failed', error: `Discovery failed: ${message}`, locationLabel: location.label };
  }

  stats.discovered = discovered.length;
  await updateRunStats(runId, stats, db);

  // --- Stage 2 & 3: identity and deduplication -----------------------------
  const newBusinessIds: string[] = [];
  const touchedBusinessIds: string[] = [];

  for (const rawDiscovered of discovered) {
    // A record with a phone and coordinates but no address is a callable lead
    // that would otherwise score too low to ever be confirmed. Reading the
    // address back from its coordinates adds a real fact; it is scored as a
    // partial address, never as one the business itself asserted.
    const { candidate: raw, addressFromReverseGeocode } = await enrichCandidateAddress(
      rawDiscovered,
      providers.geocoding,
      db,
    );
    const identity = buildIdentity(raw, {
      defaultCountry: env.defaultCountry,
      addressFromReverseGeocode,
    });

    if (!identity.name) {
      stats.excluded += 1;
      await recordRunItem({ runId, businessId: null, rawName: raw.name, outcome: 'rejected', reason: 'No usable business name.' }, db);
      continue;
    }

    // Same provider record seen before → refresh, never duplicate.
    const knownFromSource = await findBusinessBySource(raw.provider, raw.externalId, db);
    if (knownFromSource) {
      const { conflicts } = await refreshBusiness(
        knownFromSource,
        identity,
        { openingHours: raw.openingHours, openingHoursSource: raw.provider, corroborated: false },
        db,
      );
      stats.refreshed += 1;
      if (conflicts.length > 0) stats.needsReview += 1;
      await recordRunItem(
        { runId, businessId: knownFromSource, rawName: raw.name, outcome: 'refreshed', reason: 'Already known from this source.' },
        db,
      );
      if (!request.onlyNew) touchedBusinessIds.push(knownFromSource);
      continue;
    }

    const match = matchExistingBusiness(identity, await findMatchCandidates(identity, db));

    if (match.kind === 'same' && match.businessId) {
      const sources = await countSources(match.businessId, db);
      const { conflicts } = await refreshBusiness(
        match.businessId,
        identity,
        {
          openingHours: raw.openingHours,
          openingHoursSource: raw.provider,
          corroborated: sources >= 1,
        },
        db,
      );
      await recordSource(match.businessId, raw, db);
      stats.duplicates += 1;
      if (conflicts.length > 0) {
        stats.needsReview += 1;
        await recordRunItem(
          { runId, businessId: match.businessId, rawName: raw.name, outcome: 'needs_review', reason: `${match.reason} ${conflicts.join(' ')}` },
          db,
        );
      } else {
        await recordRunItem({ runId, businessId: match.businessId, rawName: raw.name, outcome: 'duplicate', reason: match.reason }, db);
      }
      if (!request.onlyNew) touchedBusinessIds.push(match.businessId);
      continue;
    }

    // 'review' and 'branch' both create a separate business: two businesses are
    // never merged on a name alone.
    const businessId = await insertBusiness(
      {
        identity,
        category: raw.category ?? request.category,
        categoryLabel: raw.categoryLabel ?? getCategory(raw.category ?? request.category)?.label ?? null,
        timezone: env.defaultTimezone,
        openingHours: raw.openingHours,
        openingHoursSource: raw.openingHours ? raw.provider : null,
        isDemoData: raw.isDemoData,
        runId,
      },
      db,
    );
    await recordSource(businessId, raw, db);

    if (match.kind === 'review') {
      await setIdentityStatus(businessId, 'NEEDS_REVIEW', identity.confidence, db);
      stats.needsReview += 1;
      await recordRunItem({ runId, businessId, rawName: raw.name, outcome: 'needs_review', reason: match.reason }, db);
    } else {
      stats.newBusinesses += 1;
      await recordRunItem(
        {
          runId,
          businessId,
          rawName: raw.name,
          outcome: 'new',
          reason: match.kind === 'branch' ? match.reason : null,
        },
        db,
      );
    }
    newBusinessIds.push(businessId);
  }

  await updateRunStats(runId, stats, db);

  // --- Stage 4: website verification ---------------------------------------
  const verificationQueue = request.onlyNew
    ? newBusinessIds
    : [...new Set([...newBusinessIds, ...touchedBusinessIds])];

  let verificationErrors = 0;
  for (const businessId of verificationQueue.slice(0, MAX_VERIFICATIONS_PER_RUN)) {
    if (stats.qualified >= request.desiredCount && request.onlyNew) break;

    const business = await getBusiness(businessId, db);
    if (!business) continue;
    if (!isVerificationStale(business.websiteCheckedAt, env.verificationTtlDays)) continue;

    const rawSource = await one<{ raw_json: string | null }>(
      db,
      'SELECT raw_json FROM business_sources WHERE business_id = $1 ORDER BY fetched_at DESC LIMIT 1',
      [businessId],
    );
    const raw = rawSource?.raw_json
      ? (JSON.parse(rawSource.raw_json) as Partial<RawBusinessCandidate>)
      : {};

    const identity = buildIdentity(
      {
        provider: 'db',
        externalId: businessId,
        sourceUrl: null,
        name: business.name,
        category: business.category,
        categoryLabel: business.categoryLabel,
        street: business.street,
        houseNumber: business.houseNumber,
        postalCode: business.postalCode,
        city: business.city,
        region: business.region,
        countryCode: business.countryCode,
        lat: business.lat,
        lon: business.lon,
        phone: business.phoneE164 ?? business.phoneRaw,
        email: business.email,
        website: null,
        socialUrls: [],
        openingHours: business.openingHours,
        openingHoursRaw: null,
        raw: {},
        isDemoData: business.isDemoData,
      },
      { defaultCountry: env.defaultCountry, corroboratingSources: await countSources(businessId, db) },
    );
    // The stored identity status (which may be NEEDS_REVIEW) wins.
    identity.status = business.identityStatus;
    identity.confidence = business.identityConfidence;

    try {
      const result = await verifyWebsite({
        identity,
        providerWebsite: typeof raw.website === 'string' ? raw.website : null,
        providerSocialUrls: Array.isArray(raw.socialUrls) ? (raw.socialUrls as string[]) : [],
        search: providers.search,
        fetcher: providers.fetcher,
      });
      await persistVerification({ businessId, result, triggeredBy: request.userId, runId }, db);
      await setWebsiteStatus(
        businessId,
        {
          status: result.status,
          confidence: result.confidence,
          url: result.acceptedUrl,
          checkedAt: result.finishedAt,
        },
        db,
      );
      stats.verified += 1;

      const updated = await getBusiness(businessId, db);
      if (updated && qualifyBusiness(updated).qualifies) stats.qualified += 1;
    } catch (error) {
      verificationErrors += 1;
      stats.verificationFailures += 1;
      const message = error instanceof ProviderError ? error.message : String(error);
      // A failed verification must never leave a business looking "checked".
      await setWebsiteStatus(
        businessId,
        { status: 'REQUIRES_MANUAL_CHECK', confidence: 0, url: null, checkedAt: Date.now() },
        db,
      );
      await recordRunItem(
        { runId, businessId, rawName: business.name, outcome: 'needs_review', reason: `Verification failed: ${message}` },
        db,
      );
    }
    await updateRunStats(runId, stats, db);
  }

  const status = verificationErrors > 0 ? 'partial' : 'completed';
  await finishRun(
    runId,
    status,
    stats,
    verificationErrors > 0 ? `${verificationErrors} business(es) could not be verified and need a manual check.` : null,
    db,
  );

  return {
    runId,
    stats,
    status,
    error: verificationErrors > 0 ? `${verificationErrors} verification(s) failed.` : null,
    locationLabel: location.label,
  };
}
