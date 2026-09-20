import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';
import { qualifyBusiness } from '@/lib/qualification/qualify';
import { mapBusiness } from './businesses';
import type { Business, Lead, LeadStatusDefinition, QualificationResult } from '@/lib/types';

export interface LeadRow {
  business: Business;
  lead: Lead | null;
  assignedUserName: string | null;
  qualification: QualificationResult;
}

export type ListScope = 'pool' | 'leads';

export interface ListFilters {
  scope: ListScope;
  search?: string;
  websiteStatus?: string[];
  identityStatus?: string[];
  leadStatus?: string[];
  assignedUserId?: string | 'unassigned';
  category?: string;
  city?: string;
  qualifiedOnly?: boolean;
  uncalled?: boolean;
  callbackDue?: boolean;
  needsManualCheck?: boolean;
  includeExcluded?: boolean;
  includeDemo?: boolean;
  sort?: string;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'b.name COLLATE NOCASE',
  city: 'b.city COLLATE NOCASE',
  category: 'b.category_label COLLATE NOCASE',
  website: 'b.website_status',
  confidence: 'b.website_confidence',
  identity: 'b.identity_confidence',
  leadStatus: 's.sort_order',
  lastCall: 'l.last_call_at',
  callCount: 'l.call_count',
  created: 'b.created_at',
  updated: 'b.updated_at',
  callback: 'l.next_callback_at',
};

interface JoinedRow extends Record<string, unknown> {
  lead_id: string | null;
  lead_status: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  priority: number | null;
  qualification_json: string | null;
  call_count: number | null;
  last_call_at: number | null;
  last_call_by: string | null;
  next_callback_at: number | null;
  locked_by: string | null;
  locked_at: number | null;
  created_by: string | null;
  lead_created_at: number | null;
  lead_updated_at: number | null;
}

function buildWhere(filters: ListFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.scope === 'leads') clauses.push('l.id IS NOT NULL');
  if (!filters.includeExcluded) clauses.push('b.excluded_at IS NULL');
  if (filters.includeDemo === false) clauses.push('b.is_demo_data = 0');

  if (filters.search) {
    const needle = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      '(LOWER(b.name) LIKE ? OR LOWER(b.city) LIKE ? OR LOWER(b.street) LIKE ? OR b.phone_e164 LIKE ? OR LOWER(b.postal_code) LIKE ?)',
    );
    params.push(needle, needle, needle, needle, needle);
  }
  if (filters.websiteStatus?.length) {
    clauses.push(`b.website_status IN (${filters.websiteStatus.map(() => '?').join(',')})`);
    params.push(...filters.websiteStatus);
  }
  if (filters.identityStatus?.length) {
    clauses.push(`b.identity_status IN (${filters.identityStatus.map(() => '?').join(',')})`);
    params.push(...filters.identityStatus);
  }
  if (filters.leadStatus?.length) {
    clauses.push(`l.status IN (${filters.leadStatus.map(() => '?').join(',')})`);
    params.push(...filters.leadStatus);
  }
  if (filters.assignedUserId === 'unassigned') {
    clauses.push('l.assigned_user_id IS NULL');
  } else if (filters.assignedUserId) {
    clauses.push('l.assigned_user_id = ?');
    params.push(filters.assignedUserId);
  }
  if (filters.category) {
    clauses.push('b.category = ?');
    params.push(filters.category);
  }
  if (filters.city) {
    clauses.push('b.city_normalized = ?');
    params.push(filters.city);
  }
  if (filters.qualifiedOnly) {
    clauses.push("b.website_status = 'VERIFIED_NO_WEBSITE'");
    clauses.push("b.identity_status = 'CONFIRMED'");
    clauses.push('b.phone_e164 IS NOT NULL');
  }
  if (filters.needsManualCheck) {
    clauses.push("b.website_status IN ('REQUIRES_MANUAL_CHECK','WEBSITE_UNCERTAIN','IDENTITY_UNVERIFIED')");
  }
  if (filters.uncalled) {
    clauses.push('(l.call_count IS NULL OR l.call_count = 0)');
  }
  if (filters.callbackDue) {
    clauses.push('l.next_callback_at IS NOT NULL AND l.next_callback_at <= ?');
    params.push(Date.now());
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const BASE_FROM = `
  FROM businesses b
  LEFT JOIN leads l ON l.business_id = b.id
  LEFT JOIN lead_statuses s ON s.key = l.status
  LEFT JOIN users u ON u.id = l.assigned_user_id
`;

export function listBusinessRows(filters: ListFilters, db: Database = getDb()): LeadRow[] {
  const { sql: where, params } = buildWhere(filters);
  const sortKey = filters.sort && SORT_COLUMNS[filters.sort] ? filters.sort : 'name';
  const direction = filters.direction === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
  const offset = Math.max(0, filters.offset ?? 0);

  const rows = db
    .prepare(
      `SELECT b.*, l.id AS lead_id, l.status AS lead_status, l.assigned_user_id, u.name AS assigned_user_name,
              l.priority, l.qualification_json, l.call_count, l.last_call_at, l.last_call_by,
              l.next_callback_at, l.locked_by, l.locked_at, l.created_by,
              l.created_at AS lead_created_at, l.updated_at AS lead_updated_at
       ${BASE_FROM} ${where}
       ORDER BY ${SORT_COLUMNS[sortKey]} ${direction} NULLS LAST, b.name COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as JoinedRow[];

  return rows.map(mapJoinedRow);
}

export function countBusinessRows(filters: ListFilters, db: Database = getDb()): number {
  const { sql: where, params } = buildWhere(filters);
  const row = db.prepare(`SELECT COUNT(*) AS n ${BASE_FROM} ${where}`).get(...params) as { n: number };
  return row.n;
}

function mapJoinedRow(row: JoinedRow): LeadRow {
  const business = mapBusiness(row as never);
  const lead: Lead | null = row.lead_id
    ? {
        id: row.lead_id,
        businessId: business.id,
        status: row.lead_status ?? 'new',
        assignedUserId: row.assigned_user_id,
        priority: row.priority ?? 0,
        qualification: row.qualification_json ? (JSON.parse(row.qualification_json) as QualificationResult) : null,
        callCount: row.call_count ?? 0,
        lastCallAt: row.last_call_at,
        lastCallBy: row.last_call_by,
        nextCallbackAt: row.next_callback_at,
        lockedBy: row.locked_by,
        lockedAt: row.locked_at,
        createdBy: row.created_by,
        createdAt: row.lead_created_at ?? business.createdAt,
        updatedAt: row.lead_updated_at ?? business.updatedAt,
      }
    : null;

  return {
    business,
    lead,
    assignedUserName: row.assigned_user_name,
    qualification: qualifyBusiness(business),
  };
}

export function getLeadByBusiness(businessId: string, db: Database = getDb()): Lead | null {
  const row = db.prepare('SELECT * FROM leads WHERE business_id = ?').get(businessId) as
    | Record<string, never>
    | undefined;
  if (!row) return null;
  return mapLead(row);
}

export function getLead(leadId: string, db: Database = getDb()): Lead | null {
  const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as Record<string, never> | undefined;
  return row ? mapLead(row) : null;
}

function mapLead(row: Record<string, never>): Lead {
  const r = row as unknown as {
    id: string;
    business_id: string;
    status: string;
    assigned_user_id: string | null;
    priority: number;
    qualification_json: string | null;
    call_count: number;
    last_call_at: number | null;
    last_call_by: string | null;
    next_callback_at: number | null;
    locked_by: string | null;
    locked_at: number | null;
    created_by: string | null;
    created_at: number;
    updated_at: number;
  };
  return {
    id: r.id,
    businessId: r.business_id,
    status: r.status,
    assignedUserId: r.assigned_user_id,
    priority: r.priority,
    qualification: r.qualification_json ? (JSON.parse(r.qualification_json) as QualificationResult) : null,
    callCount: r.call_count,
    lastCallAt: r.last_call_at,
    lastCallBy: r.last_call_by,
    nextCallbackAt: r.next_callback_at,
    lockedBy: r.locked_by,
    lockedAt: r.locked_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class QualificationBlockedError extends Error {
  readonly blockers: string[];
  constructor(blockers: string[]) {
    super(`This business does not qualify as a lead: ${blockers.join(' ')}`);
    this.name = 'QualificationBlockedError';
    this.blockers = blockers;
  }
}

export interface PromoteOptions {
  /** Allows an admin to override qualification, recorded in the audit log. */
  force?: boolean;
  assignedUserId?: string | null;
  status?: string;
}

/**
 * Promotes a researched business into the active lead list.
 *
 * Always an explicit human action — discovery never calls this. Unqualified
 * businesses are refused unless an admin explicitly overrides, and the override
 * is recorded on the lead itself.
 */
export function promoteToLead(
  businessId: string,
  userId: string,
  options: PromoteOptions = {},
  db: Database = getDb(),
): Lead {
  const existing = getLeadByBusiness(businessId, db);
  if (existing) return existing;

  const businessRow = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId) as
    | Record<string, never>
    | undefined;
  if (!businessRow) throw new Error('Business not found.');
  const business = mapBusiness(businessRow as never);

  const qualification = qualifyBusiness(business);
  if (!qualification.qualifies && !options.force) {
    throw new QualificationBlockedError(qualification.blockers);
  }

  const now = Date.now();
  const id = newId('lead');
  const status = options.status ?? 'new';

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO leads (id, business_id, status, assigned_user_id, priority, qualification_json,
                          call_count, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,?,?,?)`,
    ).run(
      id,
      businessId,
      status,
      options.assignedUserId ?? null,
      0,
      JSON.stringify({ ...qualification, overridden: !qualification.qualifies }),
      userId,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO lead_status_history (id, lead_id, from_status, to_status, user_id, note, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      newId('lsh'),
      id,
      null,
      status,
      userId,
      qualification.qualifies ? 'Promoted from the research pool.' : 'Promoted with a qualification override.',
      now,
    );
  });
  write();

  const created = getLead(id, db);
  if (!created) throw new Error('Lead creation failed.');
  return created;
}

export function removeLead(leadId: string, db: Database = getDb()): void {
  db.prepare('DELETE FROM leads WHERE id = ?').run(leadId);
}

export function updateLeadStatus(
  leadId: string,
  status: string,
  userId: string,
  note: string | null = null,
  db: Database = getDb(),
): void {
  const current = getLead(leadId, db);
  if (!current) throw new Error('Lead not found.');
  const now = Date.now();
  const write = db.transaction(() => {
    db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').run(status, now, leadId);
    db.prepare(
      `INSERT INTO lead_status_history (id, lead_id, from_status, to_status, user_id, note, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(newId('lsh'), leadId, current.status, status, userId, note, now);
  });
  write();
}

export function assignLead(leadId: string, assignedUserId: string | null, db: Database = getDb()): void {
  db.prepare('UPDATE leads SET assigned_user_id = ?, updated_at = ? WHERE id = ?').run(
    assignedUserId,
    Date.now(),
    leadId,
  );
}

export function setCallback(leadId: string, callbackAt: number | null, db: Database = getDb()): void {
  db.prepare('UPDATE leads SET next_callback_at = ?, updated_at = ? WHERE id = ?').run(
    callbackAt,
    Date.now(),
    leadId,
  );
}

export function leadStatusHistory(leadId: string, db: Database = getDb()) {
  return db
    .prepare(
      `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at, u.name AS user_name
         FROM lead_status_history h
         LEFT JOIN users u ON u.id = h.user_id
        WHERE h.lead_id = ? ORDER BY h.created_at DESC`,
    )
    .all(leadId) as Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    note: string | null;
    created_at: number;
    user_name: string | null;
  }>;
}

export function listLeadStatuses(db: Database = getDb()): LeadStatusDefinition[] {
  const rows = db
    .prepare('SELECT * FROM lead_statuses WHERE is_active = 1 ORDER BY sort_order')
    .all() as Array<{
    key: string;
    label: string;
    tone: string;
    sort_order: number;
    is_active: number;
    is_terminal: number;
    is_callable: number;
  }>;
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    tone: r.tone as LeadStatusDefinition['tone'],
    sortOrder: r.sort_order,
    isActive: r.is_active === 1,
    isTerminal: r.is_terminal === 1,
    isCallable: r.is_callable === 1,
  }));
}

/**
 * The calling queue.
 *
 * Ordering, most urgent first:
 *   1. callbacks that are due,
 *   2. leads assigned to the caller,
 *   3. unassigned leads,
 *   4. fewest attempts so far, then least recently called.
 *
 * Terminal statuses and leads without a phone number are excluded — there is
 * nothing to dial. A lead is never removed from this list by being called; it
 * moves down the order instead.
 */
export function callingQueue(userId: string, limit = 50, db: Database = getDb()): LeadRow[] {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT b.*, l.id AS lead_id, l.status AS lead_status, l.assigned_user_id, u.name AS assigned_user_name,
              l.priority, l.qualification_json, l.call_count, l.last_call_at, l.last_call_by,
              l.next_callback_at, l.locked_by, l.locked_at, l.created_by,
              l.created_at AS lead_created_at, l.updated_at AS lead_updated_at
       ${BASE_FROM}
       WHERE l.id IS NOT NULL
         AND b.excluded_at IS NULL
         AND b.phone_e164 IS NOT NULL
         AND s.is_callable = 1
         AND (l.next_callback_at IS NULL OR l.next_callback_at <= ?)
       ORDER BY
         CASE WHEN l.next_callback_at IS NOT NULL AND l.next_callback_at <= ? THEN 0 ELSE 1 END,
         CASE WHEN l.assigned_user_id = ? THEN 0 WHEN l.assigned_user_id IS NULL THEN 1 ELSE 2 END,
         l.priority DESC,
         l.call_count ASC,
         COALESCE(l.last_call_at, 0) ASC,
         b.name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .all(now, now, userId, limit) as JoinedRow[];
  return rows.map(mapJoinedRow);
}

/** Counts used by the dashboard. */
export function leadCounts(db: Database = getDb()) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM businesses WHERE excluded_at IS NULL) AS researched,
         (SELECT COUNT(*) FROM businesses WHERE website_status = 'VERIFIED_NO_WEBSITE' AND identity_status = 'CONFIRMED'
             AND phone_e164 IS NOT NULL AND excluded_at IS NULL) AS qualified,
         (SELECT COUNT(*) FROM businesses WHERE website_status IN ('REQUIRES_MANUAL_CHECK','WEBSITE_UNCERTAIN','IDENTITY_UNVERIFIED')
             AND excluded_at IS NULL) AS manualCheck,
         (SELECT COUNT(*) FROM leads) AS leads,
         (SELECT COUNT(*) FROM leads l JOIN lead_statuses s ON s.key = l.status WHERE s.is_callable = 1) AS callable,
         (SELECT COUNT(*) FROM leads WHERE next_callback_at IS NOT NULL) AS callbacks,
         (SELECT COUNT(*) FROM leads WHERE status = 'interested') AS interested,
         (SELECT COUNT(*) FROM leads WHERE status = 'converted') AS converted`,
    )
    .get() as {
    researched: number;
    qualified: number;
    manualCheck: number;
    leads: number;
    callable: number;
    callbacks: number;
    interested: number;
    converted: number;
  };
  return row;
}
