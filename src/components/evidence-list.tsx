import { CHANNEL_LABELS, type ChannelResult, type EvidenceItem, type WebsiteCandidate } from '@/lib/types';
import { Badge, Value } from './ui';

const STANCE_TONE = { supports: 'good', contradicts: 'bad', neutral: 'neutral' } as const;
const STANCE_LABEL = { supports: 'Supports', contradicts: 'Conflicts', neutral: 'Context' } as const;

/**
 * The "Why?" section.
 *
 * Shows concrete, checkable facts and their sources — what was searched, what
 * was found, what was rejected and why. It never shows model reasoning.
 */
/**
 * The evidence trail.
 *
 * What is shown by default is the evidence that actually decided the outcome —
 * the items that support or contradict it. The neutral context (each channel's
 * status, each rejected candidate) is already presented above this list in its
 * own section, so repeating all of it inline buried the two or three lines
 * that matter. It stays one click away, because the whole promise of this
 * product is that a person can check the reasoning by hand.
 */
export function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (evidence.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-soft">No verification has been run for this business yet.</p>;
  }

  const decisive = evidence.filter((item) => item.stance !== 'neutral');
  const context = evidence.filter((item) => item.stance === 'neutral');

  return (
    <>
      <Items items={decisive.length > 0 ? decisive : evidence} />
      {decisive.length > 0 && context.length > 0 && (
        <details className="border-t border-line px-4 py-2">
          <summary className="cursor-pointer text-xs text-ink-soft">
            Show the full trail ({context.length} more step{context.length === 1 ? '' : 's'} already summarised above)
          </summary>
          <div className="-mx-4 mt-2">
            <Items items={context} />
          </div>
        </details>
      )}
    </>
  );
}

function Items({ items }: { items: EvidenceItem[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((item, index) => (
        <li key={item.id ?? `${item.kind}-${index}`} className="px-4 py-2.5">
          <div className="flex flex-wrap items-start gap-2">
            <Badge tone={STANCE_TONE[item.stance]}>{STANCE_LABEL[item.stance]}</Badge>
            <p className="min-w-0 flex-1 text-sm font-medium text-ink">{item.statement}</p>
          </div>
          {item.detail && <p className="mt-1 text-sm text-ink-soft">{item.detail}</p>}
          {(item.sourceLabel || item.sourceUrl) && (
            <p className="mt-1 text-xs text-ink-muted">
              Source: {item.sourceLabel ?? 'link'}
              {item.sourceUrl && (
                <>
                  {' · '}
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    {item.sourceUrl.length > 70 ? `${item.sourceUrl.slice(0, 70)}…` : item.sourceUrl}
                  </a>
                </>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const CHANNEL_TONE = { ok: 'good', unavailable: 'warn', error: 'bad', skipped: 'neutral' } as const;

export function ChannelList({ channels }: { channels: ChannelResult[] }) {
  if (channels.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {channels.map((channel) => (
        <li key={channel.channel} className="flex flex-wrap items-start gap-2 px-4 py-2 text-sm">
          <Badge tone={CHANNEL_TONE[channel.status]}>{channel.status}</Badge>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{CHANNEL_LABELS[channel.channel]}</p>
            <p className="text-xs text-ink-soft">
              <Value>{channel.detail}</Value>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const DECISION_TONE = { ACCEPTED: 'good', PROBABLE: 'info', REJECTED: 'neutral', UNREACHABLE: 'warn' } as const;

export function CandidateList({ candidates }: { candidates: WebsiteCandidate[] }) {
  if (candidates.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-soft">No candidate domains were found for this business.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {candidates.map((candidate, index) => (
        <li key={`${candidate.domain}-${index}`} className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={DECISION_TONE[candidate.decision]}>{candidate.decision.toLowerCase()}</Badge>
            <a
              href={candidate.finalUrl ?? candidate.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm font-medium text-ink underline-offset-2 hover:underline"
            >
              {candidate.domain}
            </a>
            <span className="text-xs text-ink-muted">
              via {candidate.sourceChannel.replace(/_/g, ' ')} · score {candidate.score}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{candidate.decisionReason}</p>
          {candidate.signals.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {candidate.signals.map((signal) => (
                <li key={signal.key}>
                  <Badge tone={signal.points < 0 ? 'bad' : signal.points > 0 ? 'good' : 'neutral'} title={signal.detail ?? undefined}>
                    {signal.label}
                    {signal.points !== 0 && (
                      <span className="font-normal opacity-70">
                        {signal.points > 0 ? '+' : ''}
                        {signal.points}
                      </span>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
