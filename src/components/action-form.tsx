'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/app/actions/leads';

type ServerAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const INITIAL: ActionResult = { ok: false, error: null };

function Submit({
  children,
  className,
  pendingLabel,
  title,
  onClick,
}: {
  children: ReactNode;
  className: string;
  pendingLabel?: string;
  title?: string;
  onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} title={title} onClick={onClick}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  );
}

/**
 * A small form bound to a server action, with inline feedback.
 * Keeps mutations progressive-enhancement friendly: it still works without JS.
 */
export function ActionForm({
  action,
  fields,
  label,
  className,
  pendingLabel,
  title,
  confirm,
  onBeforeSubmit,
  children,
  showMessage = true,
}: {
  action: ServerAction;
  fields?: Record<string, string | number | null | undefined>;
  label: ReactNode;
  className: string;
  pendingLabel?: string;
  title?: string;
  confirm?: string;
  onBeforeSubmit?: () => void;
  children?: ReactNode;
  showMessage?: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
          return;
        }
        onBeforeSubmit?.();
      }}
      className="inline-flex flex-col gap-1"
    >
      {Object.entries(fields ?? {}).map(([name, value]) =>
        value === null || value === undefined ? null : (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ),
      )}
      {children}
      <Submit className={className} pendingLabel={pendingLabel} title={title}>
        {label}
      </Submit>
      {showMessage && state.error && (
        <p role="alert" className="max-w-xs text-xs text-bad">
          {state.error}
        </p>
      )}
      {showMessage && state.ok && state.message && <p className="max-w-xs text-xs text-good">{state.message}</p>}
    </form>
  );
}
