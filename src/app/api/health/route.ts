import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Health check for load balancers and container orchestrators.
 *
 * Unauthenticated by design, so it reports only whether the process is up and
 * the database answers. It never reveals configuration, provider names, counts
 * or any business data.
 */
export async function GET() {
  try {
    await getDb().query('SELECT 1');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
