import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Photo proxy.
 *
 * The browser never talks to the photo provider directly, so the API key stays
 * on the server and no request from a user's browser is attributed to them.
 * Only references that look like a Places photo name are accepted.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Not signed in.', { status: 401 });

  if (env.photoProvider !== 'google-places' || !env.googleMapsApiKey) {
    return new NextResponse('No photo provider is configured.', { status: 404 });
  }

  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
    return new NextResponse('Invalid photo reference.', { status: 400 });
  }

  const target = new URL(`https://places.googleapis.com/v1/${ref}/media`);
  target.searchParams.set('maxWidthPx', '640');
  target.searchParams.set('key', env.googleMapsApiKey);

  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(env.fetchTimeoutMs) });
    if (!response.ok || !response.body) {
      return new NextResponse('The photo could not be loaded.', { status: 502 });
    }
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'image/jpeg',
        // Cached by the browser only, for the length of a working session.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('The photo could not be loaded.', { status: 504 });
  }
}
