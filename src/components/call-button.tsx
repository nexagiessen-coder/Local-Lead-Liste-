'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { telHref } from '@/lib/format';

/**
 * Click-to-call.
 *
 * The control is a real `tel:` link so the device can dial and so it behaves
 * like a link for keyboard and mobile users. Pressing it also records a call
 * attempt (timestamp, user, counter) through a background request.
 *
 * What it deliberately does *not* do: remove, hide or reorder the lead. After a
 * call the lead is still on screen, so the caller always knows exactly which
 * business they just dialled.
 */
export function CallButton({
  leadId,
  phoneE164,
  label = 'Call',
  size = 'sm',
}: {
  leadId: string;
  phoneE164: string | null;
  label?: string;
  size?: 'sm' | 'lg';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const href = telHref(phoneE164);

  if (!href) {
    return (
      <span className="text-xs text-ink-muted italic" title="No usable phone number was verified for this business.">
        No phone
      </span>
    );
  }

  const className =
    size === 'lg'
      ? 'inline-flex items-center justify-center gap-2 rounded-md bg-good px-4 py-2.5 text-base font-semibold text-white hover:opacity-90'
      : 'inline-flex items-center justify-center gap-1.5 rounded-md bg-good px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90';

  async function record() {
    setError(null);
    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'The call could not be recorded.');
        return;
      }
      setRecorded(true);
      startTransition(() => router.refresh());
    } catch {
      setError('The call could not be recorded — check your connection.');
    }
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <a
        href={href}
        className={className}
        data-testid="call-link"
        title={`Dial ${phoneE164} and record the attempt`}
        onClick={() => {
          // Fire-and-forget: the dialler opens immediately either way, and a
          // failure is surfaced below rather than silently swallowed.
          void record();
        }}
      >
        {label} {pending ? '…' : ''}
      </a>
      {recorded && !error && <span className="text-[11px] text-good">Attempt recorded</span>}
      {error && (
        <span role="alert" className="max-w-xs text-[11px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
