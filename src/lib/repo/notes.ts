import { getDb, many, run, type Db } from '@/lib/db';
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

export async function addNote(
  input: { businessId: string; leadId: string | null; userId: string; body: string },
  db: Db = getDb(),
): Promise<string> {
  const id = newId('note');
  await run(
    db,
    'INSERT INTO notes (id, business_id, lead_id, user_id, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, input.businessId, input.leadId, input.userId, input.body.trim(), Date.now()],
  );
  return id;
}

export async function listNotes(businessId: string, db: Db = getDb()): Promise<NoteRow[]> {
  const rows = await many<{
    id: string;
    business_id: string;
    lead_id: string | null;
    user_id: string;
    body: string;
    created_at: number;
    user_name: string | null;
  }>(
    db,
    `SELECT n.id, n.business_id, n.lead_id, n.user_id, n.body, n.created_at, u.name AS user_name
       FROM notes n LEFT JOIN users u ON u.id = n.user_id
      WHERE n.business_id = $1 ORDER BY n.created_at DESC`,
    [businessId],
  );
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
