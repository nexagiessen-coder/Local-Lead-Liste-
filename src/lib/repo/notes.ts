import type { Database } from 'better-sqlite3';
import { getDb } from '@/lib/db';
import { newId } from '@/lib/ids';

export interface NoteRow {
  id: string;
  businessId: string;
  leadId: string | null;
  userId: string;
  userName: string | null;
  body: string;
  createdAt: number;
}

export function addNote(
  input: { businessId: string; leadId: string | null; userId: string; body: string },
  db: Database = getDb(),
): string {
  const id = newId('note');
  db.prepare(
    'INSERT INTO notes (id, business_id, lead_id, user_id, body, created_at) VALUES (?,?,?,?,?,?)',
  ).run(id, input.businessId, input.leadId, input.userId, input.body.trim(), Date.now());
  return id;
}

export function listNotes(businessId: string, db: Database = getDb()): NoteRow[] {
  const rows = db
    .prepare(
      `SELECT n.id, n.business_id, n.lead_id, n.user_id, n.body, n.created_at, u.name AS user_name
         FROM notes n LEFT JOIN users u ON u.id = n.user_id
        WHERE n.business_id = ? ORDER BY n.created_at DESC`,
    )
    .all(businessId) as Array<{
    id: string;
    business_id: string;
    lead_id: string | null;
    user_id: string;
    body: string;
    created_at: number;
    user_name: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    leadId: r.lead_id,
    userId: r.user_id,
    userName: r.user_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}
