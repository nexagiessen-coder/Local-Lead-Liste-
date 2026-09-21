import { getDb, many, one, run, transaction, type Db } from '@/lib/db';
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
export async function persistVerification(input: PersistVerificationInput, db: Db = getDb()): Promise<string> {
  const id = newId('ver');
  const { result } = input;

  await transaction(db, async (tx) => {
    await run(
      tx,
      `INSERT INTO website_verifications
         (id, business_id, status, confidence, accepted_url, channels_json, summary,
          engine_version, triggered_by, run_id, started_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
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
      ],
    );

    for (const candidate of result.candidates) {
      await run(
        tx,
        `INSERT INTO website_candidates
           (id, verification_id, business_id, url, final_url, domain, source_channel,
            score, decision, decision_reason, signals_json, http_status, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
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
        ],
      );
    }

    const now = Date.now();
    for (const item of result.evidence) {
      await run(
        tx,
        `INSERT INTO verification_evidence
           (id, verification_id, business_id, kind, statement, detail, source_label, source_url, stance, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
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
        ],
      );
    }
  });

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
export async function getLatestVerification(
  businessId: string,
  db: Db = getDb(),
): Promise<WebsiteVerification | null> {
  const row = await one<VerificationRow>(
    db,
    'SELECT * FROM website_verifications WHERE business_id = $1 ORDER BY finished_at DESC LIMIT 1',
    [businessId],
  );
  if (!row) return null;

  const candidates = await many<{
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
  }>(db, 'SELECT * FROM website_candidates WHERE verification_id = $1 ORDER BY score DESC', [row.id]);

  // `seq` is a BIGSERIAL — insertion order. Every evidence item in one
  // verification run shares the same `created_at` millisecond, so a
  // physical sequence column (rather than the timestamp, or the
  // insertion-order-agnostic random id) is what actually preserves the
  // order the evidence was written in.
  const evidence = await many<{
    id: string;
    kind: string;
    statement: string;
    detail: string | null;
    source_label: string | null;
    source_url: string | null;
    stance: string;
    created_at: number;
  }>(db, 'SELECT * FROM verification_evidence WHERE verification_id = $1 ORDER BY seq', [row.id]);

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

export async function verificationHistory(businessId: string, db: Db = getDb()) {
  return many<{
    id: string;
    status: string;
    confidence: number;
    accepted_url: string | null;
    summary: string | null;
    finished_at: number;
  }>(
    db,
    `SELECT id, status, confidence, accepted_url, summary, finished_at
       FROM website_verifications WHERE business_id = $1 ORDER BY finished_at DESC LIMIT 20`,
    [businessId],
  );
}

/** True when the stored verification is old enough to be worth re-running. */
export function isVerificationStale(checkedAt: number | null, ttlDays: number): boolean {
  if (checkedAt === null) return true;
  return Date.now() - checkedAt > ttlDays * DAY;
}
