'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setupAction, type SetupState } from './actions';
import { Alert, FieldLabel, buttonPrimary, inputClass } from '@/components/ui';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${buttonPrimary} w-full`} disabled={pending}>
      {pending ? 'Creating account…' : 'Create administrator account'}
    </button>
  );
}

export function SetupForm() {
  const [state, formAction] = useActionState<SetupState, FormData>(setupAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      <div>
        <FieldLabel htmlFor="name">Your name</FieldLabel>
        <input id="name" name="name" required autoFocus className={inputClass} />
      </div>
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </div>
      <div>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-ink-muted">
          At least {MIN_PASSWORD_LENGTH} characters, including a letter and a digit.
        </p>
      </div>
      <div>
        <FieldLabel htmlFor="confirm">Repeat password</FieldLabel>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </div>
      <SubmitButton />
    </form>
  );
}
