import { getDb, many, one, run, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { boundingBox, distanceKm } from '@/lib/normalize/geo';
import { branchGroupKey, type ResolvedIdentity } from '@/lib/identity/identity';
import type { MatchCandidate } from '@/lib/identity/dedupe';
import type { Business, IdentityStatus, OpeningHours, WebsiteStatus } from '@/lib/types';

/** Row shape as stored in Postgres. */
interface BusinessRow {
  id: string;
  name: string;
  name_normalized: string;
  category: string | null;
  category_label: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  city_normalized: string | null;
  region: string | null;
  country_code: string | null;
  lat: number | null;
  lon: number | null;
  phone_raw: string | null;
  phone_e164: string | null;
  email: string | null;
  timezone: string | null;
  opening_hours_json: string | null;
  opening_hours_source: string | null;
  opening_hours_verified_at: number | null;
  identity_status: string;
  identity_confidence: number;
  identity_signals_json: string | null;
  website_status: string;
  website_confidence: number | null;
  website_url: string | null;
  website_checked_at: number | null;
  branch_group_key: string | null;
  dedupe_key_phone: string | null;
  dedupe_key_address: string | null;
  is_demo_data: number;
  first_seen_at: number;
  last_seen_at: number;
  discovered_in_run: string | null;
  excluded_at: number | null;
  exclusion_reason: string | null;
  created_at: number;
  updated_at: number;
}

export function mapBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    category: row.category,
    categoryLabel: row.category_label,
    street: row.street,
    houseNumber: row.house_number,
    postalCode: row.postal_code,
    city: row.city,
    cityNormalized: row.city_normalized,
    region: row.region,
    countryCode: row.country_code,
    lat: row.lat,
    lon: row.lon,
    phoneRaw: row.phone_raw,
    phoneE164: row.phone_e164,
    email: row.email,
    timezone: row.timezone,
    openingHours: row.opening_hours_json ? (JSON.parse(row.opening_hours_json) as OpeningHours) : null,
    openingHoursSource: row.opening_hours_source,
    openingHoursVerifiedAt: row.opening_hours_verified_at,
    identityStatus: row.identity_status as IdentityStatus,
    identityConfidence: row.identity_confidence,
    identitySignals: row.identity_signals_json ? JSON.parse(row.identity_signals_json) : [],
    websiteStatus: row.website_status as WebsiteStatus,
    websiteConfidence: row.website_confidence,
    websiteUrl: row.website_url,
    websiteCheckedAt: row.website_checked_at,
    branchGroupKey: row.branch_group_key,
    dedupeKeyPhone: row.dedupe_key_phone,
    dedupeKeyAddress: row.dedupe_key_address,
    isDemoData: row.is_demo_data === 1,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    discoveredInRun: row.discovered_in_run,
    excludedAt: row.excluded_at,
    exclusionReason: row.exclusion_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_BUSINESS = 'SELECT * FROM businesses';

export async function getBusiness(id: string, db: Db = getDb()): Promise<Business | null> {
  const row = await one<BusinessRow>(db, `${SELECT_BUSINESS} WHERE id = $1`, [id]);
  return row ? mapBusiness(row) : null;
}

/**
 * Candidates that could be the same business as the given identity.
 *
 * Pre-filters on the strong keys (phone, address) plus a geographic box and a
 * normalised-name lookup, so the matcher only sees plausible rows.
 */
export async function findMatchCandidates(
  identity: ResolvedIdentity,
  db: Db = getDb(),
): Promise<MatchCandidate[]> {
  const found = new Map<string, MatchCandidate>();
  const add = (rows: BusinessRow[]) => {
    for (const raw of rows) {
      found.set(raw.id, {
        id: raw.id,
        name: raw.name,
        phoneE164: raw.phone_e164,
        dedupeKeyAddress: raw.dedupe_key_address,
        postalCode: raw.postal_code,
        city: raw.city,
        lat: raw.lat,
        lon: raw.lon,
      });
    }
  };

  if (identity.dedupeKeyPhone) {
    add(await many<BusinessRow>(db, `${SELECT_BUSINESS} WHERE dedupe_key_phone = $1`, [identity.dedupeKeyPhone]));
  }
  if (identity.dedupeKeyAddress) {
    add(
      await many<BusinessRow>(db, `${SELECT_BUSINESS} WHERE dedupe_key_address = $1`, [
        identity.dedupeKeyAddress,
      ]),
    );
  }
  if (identity.nameNormalized) {
    add(await many<BusinessRow>(db, `${SELECT_BUSINESS} WHERE name_normalized = $1`, [identity.nameNormalized]));
  }
  if (identity.lat !== null && identity.lon !== null) {
    const box = boundingBox({ lat: identity.lat, lon: identity.lon }, 0.25);
    add(
      await many<BusinessRow>(
        db,
        `${SELECT_BUSINESS} WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`,
        [box.minLat, box.maxLat, box.minLon, box.maxLon],
      ),
    );
  }
  return [...found.values()];
}

export interface InsertBusinessInput {
  identity: ResolvedIdentity;
  category: string | null;
  categoryLabel: string | null;
  timezone: string;
  openingHours: OpeningHours | null;
  openingHoursSource: string | null;
  isDemoData: boolean;
  runId: string | null;
}

export async function insertBusiness(input: InsertBusinessInput, db: Db = getDb()): Promise<string> {
  const now = Date.now();
  const id = newId('biz');
  const { identity } = input;

  await run(
    db,
    `INSERT INTO businesses (
       id, name, name_normalized, category, category_label,
       street, house_number, postal_code, city, city_normalized, region, country_code,
       lat, lon, phone_raw, phone_e164, email, timezone,
       opening_hours_json, opening_hours_source, opening_hours_verified_at,
       identity_status, identity_confidence, identity_signals_json,
       website_status, branch_group_key, dedupe_key_phone, dedupe_key_address,
       is_demo_data, first_seen_at, last_seen_at, discovered_in_run, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)`,
    [
      id,
      identity.name,
      identity.nameNormalized,
      input.category,
      input.categoryLabel,
      identity.street,
      identity.houseNumber,
      identity.postalCode,
      identity.city,
      identity.cityNormalized,
      identity.region,
      identity.countryCode,
      identity.lat,
      identity.lon,
      identity.phoneRaw,
      identity.phoneE164,
      identity.email,
      input.timezone,
      input.openingHours ? JSON.stringify(input.openingHours) : null,
      input.openingHoursSource,
      input.openingHours ? now : null,
      identity.status,
      identity.confidence,
      JSON.stringify(identity.signals),
      'NOT_CHECKED',
      branchGroupKey(identity.name, identity.countryCode),
      identity.dedupeKeyPhone,
      identity.dedupeKeyAddress,
      input.isDemoData ? 1 : 0,
      now,
      now,
      input.runId,
      now,
      now,
    ],
  );
  return id;
}

/**
 * Refreshes an existing business with newly discovered facts.
 *
 * Only fills gaps and updates `last_seen_at`; it never overwrites a value that
 * is already present with a conflicting one, because a conflict is a signal
 * that needs review rather than a silent update.
 */
export async function refreshBusiness(
  businessId: string,
  identity: ResolvedIdentity,
  extra: { openingHours: OpeningHours | null; openingHoursSource: string | null; corroborated: boolean },
  db: Db = getDb(),
): Promise<{ conflicts: string[] }> {
  const existing = await getBusiness(businessId, db);
  if (!existing) return { conflicts: [] };
  const now = Date.now();
  const conflicts: string[] = [];

  if (existing.phoneE164 && identity.phoneE164 && existing.phoneE164 !== identity.phoneE164) {
    conflicts.push(`Phone differs between sources: ${existing.phoneE164} vs ${identity.phoneE164}.`);
  }
  if (existing.postalCode && identity.postalCode && existing.postalCode !== identity.postalCode) {
    conflicts.push(`Postal code differs between sources: ${existing.postalCode} vs ${identity.postalCode}.`);
  }

  const updates: Record<string, string | number | null> = {
    last_seen_at: now,
    updated_at: now,
  };
  if (!existing.phoneE164 && identity.phoneE164) {
    updates.phone_e164 = identity.phoneE164;
    updates.phone_raw = identity.phoneRaw;
    updates.dedupe_key_phone = identity.dedupeKeyPhone;
  }
  if (!existing.street && identity.street) updates.street = identity.street;
  if (!existing.houseNumber && identity.houseNumber) updates.house_number = identity.houseNumber;
  if (!existing.postalCode && identity.postalCode) updates.postal_code = identity.postalCode;
  if (!existing.city && identity.city) {
    updates.city = identity.city;
    updates.city_normalized = identity.cityNormalized;
  }
  if (existing.lat === null && identity.lat !== null) {
    updates.lat = identity.lat;
    updates.lon = identity.lon;
  }
  if (!existing.email && identity.email) updates.email = identity.email;
  if (!existing.dedupeKeyAddress && identity.dedupeKeyAddress) {
    updates.dedupe_key_address = identity.dedupeKeyAddress;
  }
  if (!existing.openingHours && extra.openingHours) {
    updates.opening_hours_json = JSON.stringify(extra.openingHours);
    updates.opening_hours_source = extra.openingHoursSource;
    updates.opening_hours_verified_at = now;
  }

  // Corroboration from a second independent source strengthens identity.
  if (conflicts.length > 0) {
    updates.identity_status = 'NEEDS_REVIEW';
  } else if (extra.corroborated && existing.identityStatus !== 'NEEDS_REVIEW') {
    const confidence = Math.min(100, existing.identityConfidence + 15);
    updates.identity_confidence = confidence;
    if (confidence >= 70) updates.identity_status = 'CONFIRMED';
  }

  const keys = Object.keys(updates);
  const assignments = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await run(db, `UPDATE businesses SET ${assignments} WHERE id = $${keys.length + 1}`, [
    ...Object.values(updates),
    businessId,
  ]);
  return { conflicts };
}

export async function recordSource(
  businessId: string,
  source: { provider: string; externalId: string; sourceUrl: string | null; raw: unknown },
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    `INSERT INTO business_sources (id, business_id, provider, external_id, source_url, raw_json, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       business_id = EXCLUDED.business_id,
       raw_json = EXCLUDED.raw_json,
       fetched_at = EXCLUDED.fetched_at`,
    [newId('src'), businessId, source.provider, source.externalId, source.sourceUrl, JSON.stringify(source.raw), Date.now()],
  );
}

export async function findBusinessBySource(
  provider: string,
  externalId: string,
  db: Db = getDb(),
): Promise<string | null> {
  const row = await one<{ business_id: string }>(
    db,
    'SELECT business_id FROM business_sources WHERE provider = $1 AND external_id = $2',
    [provider, externalId],
  );
  return row?.business_id ?? null;
}

export async function countSources(businessId: string, db: Db = getDb()): Promise<number> {
  const row = await one<{ n: number }>(
    db,
    'SELECT COUNT(DISTINCT provider) AS n FROM business_sources WHERE business_id = $1',
    [businessId],
  );
  return row?.n ?? 0;
}

export async function setWebsiteStatus(
  businessId: string,
  update: { status: WebsiteStatus; confidence: number; url: string | null; checkedAt: number },
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    `UPDATE businesses
        SET website_status = $1, website_confidence = $2, website_url = $3, website_checked_at = $4, updated_at = $5
      WHERE id = $6`,
    [update.status, update.confidence, update.url, update.checkedAt, Date.now(), businessId],
  );
}

export async function setIdentityStatus(
  businessId: string,
  status: IdentityStatus,
  confidence: number,
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    'UPDATE businesses SET identity_status = $1, identity_confidence = $2, updated_at = $3 WHERE id = $4',
    [status, confidence, Date.now(), businessId],
  );
}

export async function excludeBusiness(
  businessId: string,
  userId: string,
  reason: string,
  db: Db = getDb(),
): Promise<void> {
  await run(
    db,
    'UPDATE businesses SET excluded_at = $1, excluded_by = $2, exclusion_reason = $3, updated_at = $4 WHERE id = $5',
    [Date.now(), userId, reason, Date.now(), businessId],
  );
}

export async function restoreBusiness(businessId: string, db: Db = getDb()): Promise<void> {
  await run(
    db,
    'UPDATE businesses SET excluded_at = NULL, excluded_by = NULL, exclusion_reason = NULL, updated_at = $1 WHERE id = $2',
    [Date.now(), businessId],
  );
}

/** Businesses near a point, used by the quick-list novelty check. */
export async function businessesWithinRadius(
  center: { lat: number; lon: number },
  radiusKm: number,
  db: Db = getDb(),
): Promise<Business[]> {
  const box = boundingBox(center, radiusKm);
  const rows = await many<BusinessRow>(
    db,
    `${SELECT_BUSINESS} WHERE lat BETWEEN $1 AND $2 AND lon BETWEEN $3 AND $4`,
    [box.minLat, box.maxLat, box.minLon, box.maxLon],
  );
  return rows
    .map(mapBusiness)
    .filter((b) => b.lat !== null && b.lon !== null && distanceKm(center, { lat: b.lat, lon: b.lon }) <= radiusKm);
}
