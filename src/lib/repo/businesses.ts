import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';
import { boundingBox, distanceKm } from '@/lib/normalize/geo';
import { branchGroupKey, type ResolvedIdentity } from '@/lib/identity/identity';
import type { MatchCandidate } from '@/lib/identity/dedupe';
import type { Business, IdentityStatus, OpeningHours, WebsiteStatus } from '@/lib/types';

/** Row shape as stored in SQLite. */
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

export function getBusiness(id: string, db: Database = getDb()): Business | null {
  const row = db.prepare(`${SELECT_BUSINESS} WHERE id = ?`).get(id) as BusinessRow | undefined;
  return row ? mapBusiness(row) : null;
}

/**
 * Candidates that could be the same business as the given identity.
 *
 * Pre-filters on the strong keys (phone, address) plus a geographic box and a
 * normalised-name lookup, so the matcher only sees plausible rows.
 */
export function findMatchCandidates(identity: ResolvedIdentity, db: Database = getDb()): MatchCandidate[] {
  const found = new Map<string, MatchCandidate>();
  const add = (rows: unknown[]) => {
    for (const raw of rows as BusinessRow[]) {
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
    add(db.prepare(`${SELECT_BUSINESS} WHERE dedupe_key_phone = ?`).all(identity.dedupeKeyPhone));
  }
  if (identity.dedupeKeyAddress) {
    add(db.prepare(`${SELECT_BUSINESS} WHERE dedupe_key_address = ?`).all(identity.dedupeKeyAddress));
  }
  if (identity.nameNormalized) {
    add(db.prepare(`${SELECT_BUSINESS} WHERE name_normalized = ?`).all(identity.nameNormalized));
  }
  if (identity.lat !== null && identity.lon !== null) {
    const box = boundingBox({ lat: identity.lat, lon: identity.lon }, 0.25);
    add(
      db
        .prepare(`${SELECT_BUSINESS} WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
        .all(box.minLat, box.maxLat, box.minLon, box.maxLon),
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

export function insertBusiness(input: InsertBusinessInput, db: Database = getDb()): string {
  const now = Date.now();
  const id = newId('biz');
  const { identity } = input;

  db.prepare(
    `INSERT INTO businesses (
       id, name, name_normalized, category, category_label,
       street, house_number, postal_code, city, city_normalized, region, country_code,
       lat, lon, phone_raw, phone_e164, email, timezone,
       opening_hours_json, opening_hours_source, opening_hours_verified_at,
       identity_status, identity_confidence, identity_signals_json,
       website_status, branch_group_key, dedupe_key_phone, dedupe_key_address,
       is_demo_data, first_seen_at, last_seen_at, discovered_in_run, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
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
export function refreshBusiness(
  businessId: string,
  identity: ResolvedIdentity,
  extra: { openingHours: OpeningHours | null; openingHoursSource: string | null; corroborated: boolean },
  db: Database = getDb(),
): { conflicts: string[] } {
  const existing = getBusiness(businessId, db);
  if (!existing) return { conflicts: [] };
  const now = Date.now();
  const conflicts: string[] = [];

  if (existing.phoneE164 && identity.phoneE164 && existing.phoneE164 !== identity.phoneE164) {
    conflicts.push(`Phone differs between sources: ${existing.phoneE164} vs ${identity.phoneE164}.`);
  }
  if (
    existing.postalCode &&
    identity.postalCode &&
    existing.postalCode !== identity.postalCode
  ) {
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

  const assignments = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE businesses SET ${assignments} WHERE id = ?`).run(...Object.values(updates), businessId);
  return { conflicts };
}

export function recordSource(
  businessId: string,
  source: { provider: string; externalId: string; sourceUrl: string | null; raw: unknown },
  db: Database = getDb(),
): void {
  db.prepare(
    `INSERT INTO business_sources (id, business_id, provider, external_id, source_url, raw_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       business_id = excluded.business_id,
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at`,
  ).run(
    newId('src'),
    businessId,
    source.provider,
    source.externalId,
    source.sourceUrl,
    JSON.stringify(source.raw),
    Date.now(),
  );
}

export function findBusinessBySource(
  provider: string,
  externalId: string,
  db: Database = getDb(),
): string | null {
  const row = db
    .prepare('SELECT business_id FROM business_sources WHERE provider = ? AND external_id = ?')
    .get(provider, externalId) as { business_id: string } | undefined;
  return row?.business_id ?? null;
}

export function countSources(businessId: string, db: Database = getDb()): number {
  const row = db
    .prepare('SELECT COUNT(DISTINCT provider) AS n FROM business_sources WHERE business_id = ?')
    .get(businessId) as { n: number };
  return row.n;
}

export function setWebsiteStatus(
  businessId: string,
  update: { status: WebsiteStatus; confidence: number; url: string | null; checkedAt: number },
  db: Database = getDb(),
): void {
  db.prepare(
    `UPDATE businesses
        SET website_status = ?, website_confidence = ?, website_url = ?, website_checked_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(update.status, update.confidence, update.url, update.checkedAt, Date.now(), businessId);
}

export function setIdentityStatus(
  businessId: string,
  status: IdentityStatus,
  confidence: number,
  db: Database = getDb(),
): void {
  db.prepare('UPDATE businesses SET identity_status = ?, identity_confidence = ?, updated_at = ? WHERE id = ?')
    .run(status, confidence, Date.now(), businessId);
}

export function excludeBusiness(
  businessId: string,
  userId: string,
  reason: string,
  db: Database = getDb(),
): void {
  db.prepare('UPDATE businesses SET excluded_at = ?, excluded_by = ?, exclusion_reason = ?, updated_at = ? WHERE id = ?')
    .run(Date.now(), userId, reason, Date.now(), businessId);
}

export function restoreBusiness(businessId: string, db: Database = getDb()): void {
  db.prepare('UPDATE businesses SET excluded_at = NULL, excluded_by = NULL, exclusion_reason = NULL, updated_at = ? WHERE id = ?')
    .run(Date.now(), businessId);
}

/** Businesses near a point, used by the quick-list novelty check. */
export function businessesWithinRadius(
  center: { lat: number; lon: number },
  radiusKm: number,
  db: Database = getDb(),
): Business[] {
  const box = boundingBox(center, radiusKm);
  const rows = db
    .prepare(`${SELECT_BUSINESS} WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`)
    .all(box.minLat, box.maxLat, box.minLon, box.maxLon) as BusinessRow[];
  return rows
    .map(mapBusiness)
    .filter((b) => b.lat !== null && b.lon !== null && distanceKm(center, { lat: b.lat, lon: b.lon }) <= radiusKm);
}
