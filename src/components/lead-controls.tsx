'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  addNoteAction,
  assignLeadAction,
  manualWebsiteStatusAction,
  recordCallOutcomeAction,
  updateLeadStatusAction,
  type ActionResult,
} from '@/app/actions/leads';
import type { LeadStatusDefinition } from '@/lib/types';
import { Alert, FieldLabel, buttonPrimary, buttonSecondary, inputClass } from './ui';

const INITIAL: ActionResult = { ok: false, error: null };

function Submit({ label, className = buttonSecondary }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}

function Feedback({ state }: { state: ActionResult }) {
  if (state.error) return <Alert tone="bad">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="good">{state.message}</Alert>;
  return null;
}

export function LeadStatusControl({
  leadId,
  current,
  statuses,
}: {
  leadId: string;
  current: string;
  statuses: LeadStatusDefinition[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(updateLeadStatusAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div>
        <FieldLabel htmlFor="lead-status">Lead status</FieldLabel>
        <select id="lead-status" name="status" defaultValue={current} className={inputClass}>
          {statuses.map((status) => (
            <option key={status.key} value={status.key}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <FieldLabel htmlFor="lead-status-note">Note (optional)</FieldLabel>
        <input id="lead-status-note" name="note" className={inputClass} maxLength={2000} />
      </div>
      <Submit label="Update status" />
      <Feedback state={state} />
    </form>
  );
}

export function AssignControl({
  leadId,
  current,
  users,
}: {
  leadId: string;
  current: string | null;
  users: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(assignLeadAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div>
        <FieldLabel htmlFor="assigned">Assigned to</FieldLabel>
        <select id="assigned" name="assignedUserId" defaultValue={current ?? ''} className={inputClass}>
          <option value="">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      <Submit label="Save assignment" />
      <Feedback state={state} />
    </form>
  );
}

export function NoteForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(addNoteAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <div>
        <FieldLabel htmlFor="note-body">Add a note</FieldLabel>
        <textarea id="note-body" name="body" rows={3} className={inputClass} maxLength={4000} required />
      </div>
      <Submit label="Save note" />
      <Feedback state={state} />
    </form>
  );
}

const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No answer', status: 'no_answer' },
  { value: 'reached', label: 'Reached someone', status: 'called' },
  { value: 'callback', label: 'Call back later', status: 'callback' },
  { value: 'interested', label: 'Interested', status: 'interested' },
  { value: 'not_interested', label: 'Not interested', status: 'not_interested' },
  { value: 'wrong_number', label: 'Wrong number', status: 'wrong_number' },
  { value: 'has_website', label: 'Already has a website', status: 'already_has_site' },
  { value: 'do_not_contact', label: 'Do not contact again', status: 'do_not_contact' },
];

export function CallOutcomeForm({
  callId,
  leadId,
  statuses,
}: {
  callId: string;
  leadId: string;
  statuses: LeadStatusDefinition[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(recordCallOutcomeAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="callId" value={callId} />
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="outcome">Outcome</FieldLabel>
          <select id="outcome" name="outcome" className={inputClass} required defaultValue="">
            <option value="" disabled>
              Choose an outcome
            </option>
            {CALL_OUTCOMES.map((outcome) => (
              <option key={outcome.value} value={outcome.value}>
                {outcome.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="lead-status-after">Set lead status to</FieldLabel>
          <select id="lead-status-after" name="leadStatus" className={inputClass} defaultValue="">
            <option value="">Leave unchanged</option>
            {statuses.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="callbackAt">Callback date (optional)</FieldLabel>
          <input id="callbackAt" name="callbackAt" type="datetime-local" className={inputClass} />
        </div>
        <div>
          <FieldLabel htmlFor="durationSeconds">Duration in seconds (optional)</FieldLabel>
          <input id="durationSeconds" name="durationSeconds" type="number" min={0} max={36000} className={inputClass} />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="call-note">Note</FieldLabel>
        <textarea id="call-note" name="note" rows={2} className={inputClass} maxLength={2000} />
      </div>
      <Submit label="Save call outcome" className={buttonPrimary} />
      <Feedback state={state} />
    </form>
  );
}

/** Records a human's own check of the website status, with the reason. */
export function ManualVerificationForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(manualWebsiteStatusAction, INITIAL);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <div>
        <FieldLabel htmlFor="manual-status">I checked by hand and found</FieldLabel>
        <select id="manual-status" name="status" className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose what you found
          </option>
          <option value="VERIFIED_NO_WEBSITE">No website — confirmed</option>
          <option value="VERIFIED_WEBSITE">A website — confirmed</option>
          <option value="REQUIRES_MANUAL_CHECK">Still unclear</option>
        </select>
      </div>
      <div>
        <FieldLabel htmlFor="manual-url">Website address (required when a website was found)</FieldLabel>
        <input id="manual-url" name="url" type="url" className={inputClass} placeholder="https://example.de" />
      </div>
      <div>
        <FieldLabel htmlFor="manual-note">What did you check?</FieldLabel>
        <input id="manual-note" name="note" className={inputClass} maxLength={1000} placeholder="Searched Google and checked the Instagram bio" />
      </div>
      <Submit label="Record manual verification" />
      <Feedback state={state} />
      <p className="text-xs text-ink-muted">
        Your name and note are stored as evidence so the team can see who decided what, and when.
      </p>
    </form>
  );
}
