import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, CsrfError, getCurrentUser } from '@/lib/auth/current-user';
import { getBusiness } from '@/lib/repo/businesses';
import { getLead, updateLeadStatus } from '@/lib/repo/leads';
import { startCall } from '@/lib/repo/calls';
import { recordAudit } from '@/lib/repo/audit';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ leadId: z.string().min(1).max(64) });

/**
 * Records a call attempt.
 *
 * This is a small API route rather than a form action on purpose: the button
 * that calls it is a real `tel:` link, and handing the browser an external
 * protocol interferes with an in-flight form submission. Recording the attempt
 * with `fetch` keeps the two independent, so the attempt is always logged even
 * when the device opens a dialler.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    await assertSameOrigin();
  } catch (error) {
    if (error instanceof CsrfError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }

  let parsed;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const lead = await getLead(parsed.leadId);
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
  const business = await getBusiness(lead.businessId);
  if (!business) return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
  if (!business.phoneE164) {
    return NextResponse.json({ error: 'This business has no verified phone number.' }, { status: 400 });
  }

  const call = await startCall({
    leadId: lead.id,
    businessId: lead.businessId,
    userId: user.id,
    phoneE164: business.phoneE164,
  });

  // Moving off "new"/"ready to call" reflects that an attempt was made. The
  // lead itself stays exactly where it was in every list.
  if (lead.status === 'new' || lead.status === 'ready_to_call') {
    await updateLeadStatus(lead.id, 'called', user.id, 'Call started.');
  }

  await recordAudit({
    userId: user.id,
    action: 'call.started',
    entityType: 'lead',
    entityId: lead.id,
    detail: { callId: call.id, businessId: lead.businessId },
  });

  return NextResponse.json({ callId: call.id, callCount: lead.callCount + 1 }, { status: 201 });
}
