import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';
import { DAY } from '@/lib/time';
import type {
  CandidateSignal,
  ChannelResult,
  EvidenceItem,
  WebsiteCandidate,
  WebsiteStatus,
  WebsiteVerification,
} from '@/lib/types';
import type { VerifyResult } from '@/lib/website/verify';

export interface PersistVerificationInput {
  businessId: string;
  result: VerifyResult;
  triggeredBy: string | null;
  runId: string | null;
}

/** Stores a verification run with its candidates and evidence, atomically. */
export function persistVerification(input: PersistVerificationInput, db: Database = getDb()): string {
  const id = newId('ver');
  const { result } = input;

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO website_verifications
         (id, business_id, status, confidence, accepted_url, channels_json, summary,
          engine_version, triggered_by, run_id, started_at, finished_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.businessId,
      result.status,
      result.confidence,
      result.acceptedUrl,
      JSON.stringify(result.channels),
      result.summary,
      result.engineVersion,
      input.triggeredBy,
      input.runId,
      result.startedAt,
      result.finishedAt,
    );

    const candidateStmt = db.prepare(
      `INSERT INTO website_candidates
         (id, verification_id, business_id, url, final_url, domain, source_channel,
          score, decision, decision_reason, signals_json, http_status, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const candidate of result.candidates) {
      candidateStmt.run(
        newId('cnd'),
        id,
        input.businessId,
        candidate.url,
        candidate.finalUrl,
        candidate.domain,
        candidate.sourceChannel,
        candidate.score,
        candidate.decision,
        candidate.decisionReason,
        JSON.stringify(candidate.signals),
        candidate.httpStatus,
        candidate.fetchedAt,
      );
    }

    const evidenceStmt = db.prepare(
      `INSERT INTO verification_evidence
         (id, verification_id, business_id, kind, statement, detail, source_label, source_url, stance, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    const now = Date.now();
    for (const item of result.evidence) {
      evidenceStmt.run(
        newId('evd'),
        id,
        input.businessId,
        item.kind,
        item.statement,
        item.detail,
        item.sourceLabel,
        item.sourceUrl,
        item.stance,
        now,
      );
    }
  });

  write();
  return id;
}

interface VerificationRow {
  id: string;
  business_id: string;
  status: string;
  confidence: number;
  accepted_url: string | null;
  channels_json: string;
  summary: string | null;
  engine_version: string;
  triggered_by: string | null;
  run_id: string | null;
  started_at: number;
  finished_at: number;
}

/** The most recent verification for a business, with candidates and evidence. */
export function getLatestVerification(
  businessId: string,
  db: Database = getDb(),
): WebsiteVerification | null {
  const row = db
    .prepare('SELECT * FROM website_verifications WHERE business_id = ? ORDER BY finished_at DESC LIMIT 1')
    .get(businessId) as VerificationRow | undefined;
  if (!row) return null;

  const candidates = db
    .prepare('SELECT * FROM website_candidates WHERE verification_id = ? ORDER BY score DESC')
    .all(row.id) as Array<{
    url: string;
    final_url: string | null;
    domain: string;
    source_channel: string;
    score: number;
    decision: string;
    decision_reason: string;
    signals_json: string | null;
    http_status: number | null;
    fetched_at: number | null;
  }>;

  const evidence = db
    .prepare('SELECT * FROM verification_evidence WHERE verification_id = ? ORDER BY rowid')
    .all(row.id) as Array<{
    id: string;
    kind: string;
    statement: string;
    detail: string | null;
    source_label: string | null;
    source_url: string | null;
    stance: string;
    created_at: number;
  }>;

  return {
    id: row.id,
    businessId: row.business_id,
    status: row.status as WebsiteStatus,
    confidence: row.confidence,
    acceptedUrl: row.accepted_url,
    channels: JSON.parse(row.channels_json) as ChannelResult[],
    summary: row.summary,
    engineVersion: row.engine_version,
    triggeredBy: row.triggered_by,
    runId: row.run_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    candidates: candidates.map(
      (c): WebsiteCandidate => ({
        url: c.url,
        finalUrl: c.final_url,
        domain: c.domain,
        sourceChannel: c.source_channel as WebsiteCandidate['sourceChannel'],
        score: c.score,
        decision: c.decision as WebsiteCandidate['decision'],
        decisionReason: c.decision_reason,
        signals: c.signals_json ? (JSON.parse(c.signals_json) as CandidateSignal[]) : [],
        httpStatus: c.http_status,
        fetchedAt: c.fetched_at,
      }),
    ),
    evidence: evidence.map(
      (e): EvidenceItem => ({
        id: e.id,
        kind: e.kind,
        statement: e.statement,
        detail: e.detail,
        sourceLabel: e.source_label,
        sourceUrl: e.source_url,
        stance: e.stance as EvidenceItem['stance'],
        createdAt: e.created_at,
      }),
    ),
  };
}

export function verificationHistory(businessId: string, db: Database = getDb()) {
  return db
    .prepare(
      `SELECT id, status, confidence, accepted_url, summary, finished_at
         FROM website_verifications WHERE business_id = ? ORDER BY finished_at DESC LIMIT 20`,
    )
    .all(businessId) as Array<{
    id: string;
    status: string;
    confidence: number;
    accepted_url: string | null;
    summary: string | null;
    finished_at: number;
  }>;
}

/** True when the stored verification is old enough to be worth re-running. */
export function isVerificationStale(checkedAt: number | null, ttlDays: number): boolean {
  if (checkedAt === null) return true;
  return Date.now() - checkedAt > ttlDays * DAY;
}
