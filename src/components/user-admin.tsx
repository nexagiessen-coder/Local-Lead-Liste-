'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  changePasswordAction,
  createUserAction,
  setUserActiveAction,
  updateUserAction,
} from '@/app/actions/users';
import type { ActionResult } from '@/app/actions/leads';
import type { User } from '@/lib/types';
import { Alert, Badge, FieldLabel, buttonPrimary, buttonSecondary, inputClass } from './ui';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants';

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

export function CreateUserForm({ activeCount, maxUsers }: { activeCount: number; maxUsers: number }) {
  const [state, action] = useActionState<ActionResult, FormData>(createUserAction, INITIAL);
  const atLimit = activeCount >= maxUsers;

  return (
    <form action={action} className="space-y-3 p-4">
      {atLimit && (
        <Alert tone="warn">
          This installation is limited to {maxUsers} active users. Deactivate someone before adding another.
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="new-name">Name</FieldLabel>
          <input id="new-name" name="name" required maxLength={120} className={inputClass} disabled={atLimit} />
        </div>
        <div>
          <FieldLabel htmlFor="new-email">Email</FieldLabel>
          <input id="new-email" name="email" type="email" required className={inputClass} disabled={atLimit} />
        </div>
        <div>
          <FieldLabel htmlFor="new-password">Temporary password</FieldLabel>
          <input
            id="new-password"
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
            disabled={atLimit}
          />
        </div>
        <div>
          <FieldLabel htmlFor="new-role">Role</FieldLabel>
          <select id="new-role" name="role" defaultValue="member" className={inputClass} disabled={atLimit}>
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </div>
      <Submit label="Add user" className={buttonPrimary} />
      <Feedback state={state} />
    </form>
  );
}

export function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [updateState, updateAction] = useActionState<ActionResult, FormData>(updateUserAction, INITIAL);
  const [activeState, activeAction] = useActionState<ActionResult, FormData>(setUserActiveAction, INITIAL);
  const [passwordState, passwordAction] = useActionState<ActionResult, FormData>(changePasswordAction, INITIAL);

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{user.name}</span>
        <span className="text-sm text-ink-soft">{user.email}</span>
        <Badge tone={user.role === 'admin' ? 'accent' : 'neutral'}>{user.role}</Badge>
        {!user.isActive && <Badge tone="bad">deactivated</Badge>}
        {isSelf && <Badge tone="info">you</Badge>}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <form action={updateAction} className="space-y-2">
          <input type="hidden" name="userId" value={user.id} />
          <FieldLabel htmlFor={`name-${user.id}`}>Name</FieldLabel>
          <input id={`name-${user.id}`} name="name" defaultValue={user.name} className={inputClass} />
          <FieldLabel htmlFor={`role-${user.id}`}>Role</FieldLabel>
          <select id={`role-${user.id}`} name="role" defaultValue={user.role} className={inputClass}>
            <option value="member">Member</option>
            <option value="admin">Administrator</option>
          </select>
          <Submit label="Save" />
          <Feedback state={updateState} />
        </form>

        <form action={passwordAction} className="space-y-2">
          <input type="hidden" name="userId" value={user.id} />
          <FieldLabel htmlFor={`pw-${user.id}`}>New password</FieldLabel>
          <input
            id={`pw-${user.id}`}
            name="password"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
            autoComplete="new-password"
          />
          <FieldLabel htmlFor={`pw2-${user.id}`}>Repeat password</FieldLabel>
          <input
            id={`pw2-${user.id}`}
            name="confirm"
            type="password"
            minLength={MIN_PASSWORD_LENGTH}
            className={inputClass}
            autoComplete="new-password"
          />
          <Submit label="Change password" />
          <Feedback state={passwordState} />
        </form>

        <form action={activeAction} className="space-y-2">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="active" value={user.isActive ? '0' : '1'} />
          <p className="text-xs text-ink-soft">
            {user.isActive
              ? 'Deactivating signs this person out everywhere and frees a seat.'
              : 'Reactivating restores access if a seat is free.'}
          </p>
          <Submit label={user.isActive ? 'Deactivate' : 'Reactivate'} />
          <Feedback state={activeState} />
        </form>
      </div>
    </li>
  );
}
