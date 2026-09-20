'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { recordAudit } from '@/lib/repo/audit';
import { excludeBusiness, getBusiness, restoreBusiness, setWebsiteStatus, countSources } from '@/lib/repo/businesses';
import {
  QualificationBlockedError,
  assignLead,
  getLead,
  getLeadByBusiness,
  promoteToLead,
  removeLead,
  setCallback,
  updateLeadStatus,
} from '@/lib/repo/leads';
import { addNote } from '@/lib/repo/notes';
import { recordCallOutcome } from '@/lib/repo/calls';
import { persistVerification } from '@/lib/repo/verifications';
import { buildIdentity } from '@/lib/identity/identity';
import { verifyWebsite } from '@/lib/website/verify';
import { createProviderSet } from '@/lib/providers/registry';
import type { RawBusinessCandidate } from '@/lib/providers/types';

export interface ActionResult {
  ok: boolean;
  error: string | null;
  message?: string;
}

const ok = (message?: string): ActionResult => ({ ok: true, error: null, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

function refresh() {
  revalidatePath('/pool');
  revalidatePath('/leads');
  revalidatePath('/call');
  revalidatePath('/dashboard');
}

export async function promoteBusinessAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const force = formData.get('force') === '1';

  if (force && user.role !== 'admin') {
    return fail('Only an administrator can override the qualification rules.');
  }

  try {
    const lead = promoteToLead(businessId, user.id, { force, assignedUserId: user.id });
    recordAudit({
      userId: user.id,
      action: force ? 'lead.promoted.override' : 'lead.promoted',
      entityType: 'lead',
      entityId: lead.id,
      detail: { businessId },
    });
    refresh();
    return ok('Added to the active lead list.');
  } catch (error) {
    if (error instanceof QualificationBlockedError) return fail(error.message);
    return fail(error instanceof Error ? error.message : 'Could not promote this business.');
  }
}

export async function removeLeadAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const leadId = String(formData.get('leadId') ?? '');
  const lead = getLead(leadId);
  if (!lead) return fail('Lead not found.');

  removeLead(leadId);
  recordAudit({ userId: user.id, action: 'lead.removed', entityType: 'lead', entityId: leadId, detail: { businessId: lead.businessId } });
  refresh();
  return ok('Removed from the lead list. The business stays in the research pool.');
}

const StatusSchema = z.object({
  leadId: z.string().min(1),
  status: z.string().min(1).max(40),
  note: z.string().max(2000).optional(),
});

export async function updateLeadStatusAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = StatusSchema.safeParse({
    leadId: formData.get('leadId'),
    status: formData.get('status'),
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) return fail('Invalid status change.');

  const exists = getDb().prepare('SELECT 1 FROM lead_statuses WHERE key = ? AND is_active = 1').get(parsed.data.status);
  if (!exists) return fail('Unknown lead status.');

  try {
    updateLeadStatus(parsed.data.leadId, parsed.data.status, user.id, parsed.data.note?.trim() || null);
    recordAudit({
      userId: user.id,
      action: 'lead.status',
      entityType: 'lead',
      entityId: parsed.data.leadId,
      detail: { status: parsed.data.status },
    });
    refresh();
    return ok('Status updated.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not update the status.');
  }
}

export async function assignLeadAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const leadId = String(formData.get('leadId') ?? '');
  const raw = String(formData.get('assignedUserId') ?? '');
  const assignedUserId = raw === '' ? null : raw;

  if (assignedUserId) {
    const exists = getDb().prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1').get(assignedUserId);
    if (!exists) return fail('That user does not exist or is not active.');
  }

  assignLead(leadId, assignedUserId);
  recordAudit({ userId: user.id, action: 'lead.assigned', entityType: 'lead', entityId: leadId, detail: { assignedUserId } });
  refresh();
  return ok(assignedUserId ? 'Lead assigned.' : 'Assignment cleared.');
}

export async function addNoteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (body.length === 0) return fail('The note is empty.');
  if (body.length > 4000) return fail('The note is too long.');

  const lead = getLeadByBusiness(businessId);
  addNote({ businessId, leadId: lead?.id ?? null, userId: user.id, body });
  recordAudit({ userId: user.id, action: 'note.added', entityType: 'business', entityId: businessId });
  refresh();
  return ok('Note saved.');
}

export async function excludeBusinessAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || 'Dismissed by a user.';

  excludeBusiness(businessId, user.id, reason);
  const lead = getLeadByBusiness(businessId);
  if (lead) removeLead(lead.id);
  recordAudit({ userId: user.id, action: 'business.excluded', entityType: 'business', entityId: businessId, detail: { reason } });
  refresh();
  return ok('Business excluded. It will not appear in future research results.');
}

export async function restoreBusinessAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  restoreBusiness(businessId);
  recordAudit({ userId: user.id, action: 'business.restored', entityType: 'business', entityId: businessId });
  refresh();
  return ok('Business restored to the research pool.');
}

/** Re-runs the full website verification for one business, on demand. */
export async function reverifyBusinessAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const business = getBusiness(businessId);
  if (!business) return fail('Business not found.');

  const sourceRow = getDb()
    .prepare('SELECT raw_json FROM business_sources WHERE business_id = ? ORDER BY fetched_at DESC LIMIT 1')
    .get(businessId) as { raw_json: string | null } | undefined;
  const raw = sourceRow?.raw_json ? (JSON.parse(sourceRow.raw_json) as Partial<RawBusinessCandidate>) : {};

  const identity = buildIdentity(
    {
      provider: 'db',
      externalId: businessId,
      sourceUrl: null,
      name: business.name,
      category: business.category,
      categoryLabel: business.categoryLabel,
      street: business.street,
      houseNumber: business.houseNumber,
      postalCode: business.postalCode,
      city: business.city,
      region: business.region,
      countryCode: business.countryCode,
      lat: business.lat,
      lon: business.lon,
      phone: business.phoneE164 ?? business.phoneRaw,
      email: business.email,
      website: null,
      socialUrls: [],
      openingHours: business.openingHours,
      openingHoursRaw: null,
      raw: {},
      isDemoData: business.isDemoData,
    },
    { defaultCountry: env.defaultCountry, corroboratingSources: countSources(businessId) },
  );
  identity.status = business.identityStatus;
  identity.confidence = business.identityConfidence;

  try {
    const providers = createProviderSet();
    const result = await verifyWebsite({
      identity,
      providerWebsite: typeof raw.website === 'string' ? raw.website : null,
      providerSocialUrls: Array.isArray(raw.socialUrls) ? (raw.socialUrls as string[]) : [],
      search: providers.search,
      fetcher: providers.fetcher,
    });
    persistVerification({ businessId, result, triggeredBy: user.id, runId: null });
    setWebsiteStatus(businessId, {
      status: result.status,
      confidence: result.confidence,
      url: result.acceptedUrl,
      checkedAt: result.finishedAt,
    });
    recordAudit({
      userId: user.id,
      action: 'business.reverified',
      entityType: 'business',
      entityId: businessId,
      detail: { status: result.status, confidence: result.confidence },
    });
    refresh();
    revalidatePath(`/business/${businessId}`);
    return ok(`Verification finished: ${result.status.replace(/_/g, ' ').toLowerCase()}.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Verification failed.');
  }
}

/**
 * Manual override of website status, for when a person has checked by hand.
 * Recorded as evidence with the user's name so the trail stays honest.
 */
const ManualStatusSchema = z.object({
  businessId: z.string().min(1),
  status: z.enum(['VERIFIED_WEBSITE', 'VERIFIED_NO_WEBSITE', 'REQUIRES_MANUAL_CHECK']),
  url: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
});

export async function manualWebsiteStatusAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = ManualStatusSchema.safeParse({
    businessId: formData.get('businessId'),
    status: formData.get('status'),
    url: formData.get('url') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) return fail('Invalid manual verification.');

  const business = getBusiness(parsed.data.businessId);
  if (!business) return fail('Business not found.');
  if (parsed.data.status === 'VERIFIED_WEBSITE' && !parsed.data.url?.trim()) {
    return fail('Enter the website address you verified.');
  }

  const now = Date.now();
  persistVerification({
    businessId: parsed.data.businessId,
    triggeredBy: user.id,
    runId: null,
    result: {
      status: parsed.data.status,
      confidence: 100,
      acceptedUrl: parsed.data.url?.trim() || null,
      channels: [],
      candidates: [],
      evidence: [
        {
          kind: 'manual_verification',
          statement: `Checked by hand by ${user.name}.`,
          detail: parsed.data.note?.trim() || 'No note given.',
          sourceLabel: 'Manual verification',
          sourceUrl: parsed.data.url?.trim() || null,
          stance: 'supports',
        },
      ],
      summary: `Manually verified by ${user.name}.`,
      startedAt: now,
      finishedAt: now,
      engineVersion: 'manual/1',
    },
  });
  setWebsiteStatus(parsed.data.businessId, {
    status: parsed.data.status,
    confidence: 100,
    url: parsed.data.url?.trim() || null,
    checkedAt: now,
  });
  recordAudit({
    userId: user.id,
    action: 'business.manual_verification',
    entityType: 'business',
    entityId: parsed.data.businessId,
    detail: { status: parsed.data.status },
  });
  refresh();
  revalidatePath(`/business/${parsed.data.businessId}`);
  return ok('Manual verification recorded.');
}

// --- Calling ---------------------------------------------------------------

const OutcomeSchema = z.object({
  callId: z.string().min(1),
  outcome: z.string().min(1).max(40),
  note: z.string().max(2000).optional(),
  callbackAt: z.string().optional(),
  durationSeconds: z.string().optional(),
  leadStatus: z.string().max(40).optional(),
});

export async function recordCallOutcomeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = OutcomeSchema.safeParse({
    callId: formData.get('callId'),
    outcome: formData.get('outcome'),
    note: formData.get('note') ?? undefined,
    callbackAt: formData.get('callbackAt') ?? undefined,
    durationSeconds: formData.get('durationSeconds') ?? undefined,
    leadStatus: formData.get('leadStatus') ?? undefined,
  });
  if (!parsed.success) return fail('Invalid call outcome.');

  let callbackAt: number | null = null;
  if (parsed.data.callbackAt) {
    const ts = Date.parse(parsed.data.callbackAt);
    if (!Number.isFinite(ts)) return fail('The callback date could not be read.');
    callbackAt = ts;
  }
  const duration = parsed.data.durationSeconds ? Number.parseInt(parsed.data.durationSeconds, 10) : null;

  try {
    recordCallOutcome({
      callId: parsed.data.callId,
      outcome: parsed.data.outcome,
      note: parsed.data.note?.trim() || null,
      callbackAt,
      durationSeconds: Number.isFinite(duration) ? duration : null,
    });
    if (parsed.data.leadStatus) {
      const leadId = String(formData.get('leadId') ?? '');
      if (leadId) updateLeadStatus(leadId, parsed.data.leadStatus, user.id, parsed.data.note?.trim() || null);
    }
    recordAudit({ userId: user.id, action: 'call.outcome', entityType: 'call', entityId: parsed.data.callId, detail: { outcome: parsed.data.outcome } });
    refresh();
    return ok('Call outcome saved.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not save the call outcome.');
  }
}

export async function setCallbackAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const leadId = String(formData.get('leadId') ?? '');
  const raw = String(formData.get('callbackAt') ?? '').trim();
  if (raw === '') {
    setCallback(leadId, null);
    refresh();
    return ok('Callback cleared.');
  }
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return fail('The callback date could not be read.');
  setCallback(leadId, ts);
  refresh();
  return ok('Callback scheduled.');
}
