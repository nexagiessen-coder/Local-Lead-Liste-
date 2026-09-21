/**
 * The outcomes a caller can record, and the lead status each one implies.
 *
 * Shared by the UI and the server action so that recording an outcome with one
 * click sets the matching status without the caller having to choose it twice.
 * An explicit status on the form still wins, for the cases where the obvious
 * mapping is not what happened.
 */
export const CALL_OUTCOMES = [
  { value: 'no_answer', label: 'No answer', status: 'no_answer' },
  { value: 'reached', label: 'Reached someone', status: 'called' },
  { value: 'callback', label: 'Call back later', status: 'callback' },
  { value: 'interested', label: 'Interested', status: 'interested' },
  { value: 'not_interested', label: 'Not interested', status: 'not_interested' },
  { value: 'wrong_number', label: 'Wrong number', status: 'wrong_number' },
  { value: 'has_website', label: 'Already has a website', status: 'already_has_site' },
  { value: 'do_not_contact', label: 'Do not contact again', status: 'do_not_contact' },
] as const;

export type CallOutcomeValue = (typeof CALL_OUTCOMES)[number]['value'];

/** The lead status implied by an outcome, or null for an unknown outcome. */
export function defaultStatusForOutcome(outcome: string): string | null {
  return CALL_OUTCOMES.find((o) => o.value === outcome)?.status ?? null;
}
