import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getRun, runItems } from '@/lib/repo/research';
import { isRunning } from '@/lib/research-runner';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { id } = await context.params;
  const run = getRun(id);
  if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  return NextResponse.json({
    run,
    running: isRunning(id) || run.status === 'running',
    items: runItems(id).slice(0, 200),
  });
}
