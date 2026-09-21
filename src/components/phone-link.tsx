import { formatPhone, telHref } from '@/lib/format';

/**
 * A phone number that can actually be dialled.
 *
 * Every number in the app goes through this, for two reasons. On a phone — the
 * device this product is most often used on while calling — a number rendered
 * as plain text is unusable: it cannot be tapped, and the columns holding it
 * are the first to be cut off. And a number shown three different ways in
 * three places teaches the user not to trust that any of them is tappable.
 *
 * The tap target is deliberately generous (a minimum of ~44px of height with
 * the padding applied), which is the size a thumb reliably hits.
 *
 * This does not record a call attempt: it is for places where there is no
 * lead to record against, such as the research pool. Where a lead exists, use
 * `CallButton`, which dials *and* logs the attempt.
 */
export function PhoneLink({
  phoneE164,
  size = 'sm',
  className = '',
}: {
  phoneE164: string | null;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const href = telHref(phoneE164);
  const label = formatPhone(phoneE164);

  if (!href || !label) {
    return (
      <span className="text-xs text-ink-muted italic" title="No verified phone number for this business.">
        No phone
      </span>
    );
  }

  const base =
    size === 'lg'
      ? 'font-mono text-lg font-semibold tracking-tight'
      : 'font-mono text-sm';

  return (
    <a
      href={href}
      className={`inline-flex min-h-[2.25rem] items-center rounded-md px-1.5 py-1.5 text-ink underline decoration-line underline-offset-4 hover:bg-subtle hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${base} ${className}`}
      title={`Call ${label}`}
    >
      {label}
    </a>
  );
}
