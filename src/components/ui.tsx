import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral',
  info: 'bg-info-soft text-info',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  accent: 'bg-accent-soft text-accent-ink',
};

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  const valueTone =
    tone === 'neutral' ? 'text-ink' : tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-info';
  return (
    <div className="card px-4 py-3">
      <div className="text-xs font-medium text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueTone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-soft">
      {children}
    </label>
  );
}

export const inputClass =
  'mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-accent';

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-60';

export const buttonSecondary =
  'inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60';

export const buttonQuiet =
  'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-subtle hover:text-ink';

export function Alert({ tone = 'warn', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const border =
    tone === 'bad' ? 'border-bad/30' : tone === 'good' ? 'border-good/30' : tone === 'info' ? 'border-info/30' : 'border-warn/30';
  return (
    <div className={`rounded-md border ${border} ${TONE_CLASSES[tone]} px-3 py-2 text-sm`} role={tone === 'bad' ? 'alert' : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : ''}>{children}</div>
    </div>
  );
}

/** Renders a value, or an explicit "unknown" marker — never a guess. */
export function Value({ children, unknownLabel = 'Unknown' }: { children: ReactNode; unknownLabel?: string }) {
  const isEmpty = children === null || children === undefined || children === '';
  if (isEmpty) return <span className="text-ink-muted italic">{unknownLabel}</span>;
  return <>{children}</>;
}
