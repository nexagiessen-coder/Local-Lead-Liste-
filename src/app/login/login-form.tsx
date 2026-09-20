'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';
import { Alert, FieldLabel, buttonPrimary, inputClass } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${buttonPrimary} w-full`} disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={inputClass}
        />
      </div>
      <div>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <SubmitButton />
    </form>
  );
}
