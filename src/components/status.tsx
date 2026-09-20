import { Badge, type Tone } from './ui';
import {
  IDENTITY_STATUS_LABELS,
  WEBSITE_STATUS_LABELS,
  WEBSITE_STATUS_TONE,
  type IdentityStatus,
  type LeadStatusDefinition,
  type WebsiteStatus,
} from '@/lib/types';

/** Short, explicit explanations shown on hover — never marketing language. */
const WEBSITE_STATUS_HELP: Record<WebsiteStatus, string> = {
  NOT_CHECKED: 'This business has not been through website verification yet.',
  VERIFIED_WEBSITE: 'A website was found that carries this business’s own contact details.',
  PROBABLE_WEBSITE: 'A website probably belongs to this business, but it could not be confirmed.',
  WEBSITE_UNCERTAIN: 'Pages mentioning this business were found, but ownership could not be established.',
  VERIFIED_NO_WEBSITE:
    'Identity confirmed and every research channel completed without finding an official website.',
  REQUIRES_MANUAL_CHECK:
    'The research could not be completed or the evidence conflicts. A person needs to look.',
  IDENTITY_UNVERIFIED: 'Website status was not determined because the business identity is not confirmed.',
};

export function WebsiteStatusBadge({
  status,
  confidence,
}: {
  status: WebsiteStatus;
  confidence?: number | null;
}) {
  return (
    <Badge tone={WEBSITE_STATUS_TONE[status]} title={WEBSITE_STATUS_HELP[status]}>
      {WEBSITE_STATUS_LABELS[status]}
      {typeof confidence === 'number' && status !== 'NOT_CHECKED' ? (
        <span className="font-normal opacity-70">{confidence}</span>
      ) : null}
    </Badge>
  );
}

const IDENTITY_TONE: Record<IdentityStatus, Tone> = {
  CONFIRMED: 'good',
  PROBABLE: 'info',
  UNVERIFIED: 'warn',
  NEEDS_REVIEW: 'bad',
};

/** One-word labels for the table; the full wording stays in the tooltip. */
const IDENTITY_SHORT: Record<IdentityStatus, string> = {
  CONFIRMED: 'Confirmed',
  PROBABLE: 'Probable',
  UNVERIFIED: 'Unverified',
  NEEDS_REVIEW: 'Conflict',
};

export function IdentityBadge({
  status,
  confidence,
  compact = false,
}: {
  status: IdentityStatus;
  confidence: number;
  compact?: boolean;
}) {
  return (
    <Badge tone={IDENTITY_TONE[status]} title={`${IDENTITY_STATUS_LABELS[status]} (confidence ${confidence}/100)`}>
      {compact ? IDENTITY_SHORT[status] : IDENTITY_STATUS_LABELS[status]}
      <span className="font-normal opacity-70">{confidence}</span>
    </Badge>
  );
}

export function LeadStatusBadge({ status, statuses }: { status: string; statuses: LeadStatusDefinition[] }) {
  const definition = statuses.find((s) => s.key === status);
  return <Badge tone={(definition?.tone ?? 'neutral') as Tone}>{definition?.label ?? status}</Badge>;
}

export function OpenStateBadge({
  state,
  detail,
  compact = false,
}: {
  state: 'open' | 'closed' | 'unknown';
  detail: string | null;
  compact?: boolean;
}) {
  if (state === 'unknown') {
    return (
      <Badge tone="neutral" title="Opening hours are not available or could not be parsed. They are never guessed.">
        {compact ? 'No hours' : 'Hours unavailable'}
      </Badge>
    );
  }
  return (
    <Badge tone={state === 'open' ? 'good' : 'neutral'} title={detail ?? undefined}>
      {state === 'open' ? 'Open now' : 'Closed'}
      {detail && !compact ? <span className="font-normal opacity-70">{detail}</span> : null}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warn" title="This record comes from the built-in demo dataset, not from real research.">
      Demo data
    </Badge>
  );
}
