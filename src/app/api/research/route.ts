import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, CsrfError, getClientIp, getCurrentUser } from '@/lib/auth/current-user';
import { rateLimit } from '@/lib/auth/rate-limit';
import { ResearchBusyError, startResearch } from '@/lib/research-runner';
import { MAX_COUNT, MAX_RADIUS_KM } from '@/lib/command/parse';
import { CATEGORIES } from '@/lib/discovery/categories';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  location: z.string().min(2).max(120),
  radiusKm: z.number().min(1).max(MAX_RADIUS_KM),
  category: z
    .string()
    .max(40)
    .nullable()
    .refine((v) => v === null || CATEGORIES.some((c) => c.key === v), 'Unknown category.'),
  count: z.number().int().min(1).max(MAX_COUNT),
  onlyNew: z.boolean().default(true),
  queryText: z.string().max(400).nullable().default(null),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const ip = await getClientIp();
  const limit = rateLimit(`research:${user.id}:${ip}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Research rate limit reached. Try again in ${Math.ceil(limit.retryAfterMs / 60_000)} minute(s).` },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map((i) => i.message).join(' ') : 'Invalid request.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { runId } = await startResearch({
      locationQuery: parsed.location,
      radiusKm: parsed.radiusKm,
      category: parsed.category,
      desiredCount: parsed.count,
      onlyNew: parsed.onlyNew,
      userId: user.id,
      queryText: parsed.queryText,
    });
    return NextResponse.json({ runId }, { status: 202 });
  } catch (error) {
    if (error instanceof ResearchBusyError) {
      return NextResponse.json({ error: error.message, runId: error.runId }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Research could not be started.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
