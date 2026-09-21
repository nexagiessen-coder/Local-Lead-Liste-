import Link from 'next/link';
import { getBusinessPhotos } from '@/lib/photos';
import { formatDateTime, formatPhone, formatRelative, manualSearchUrl } from '@/lib/format';
import { callHistory } from '@/lib/repo/calls';
import { getLeadByBusiness, leadStatusHistory, listLeadStatuses } from '@/lib/repo/leads';
import { listNotes } from '@/lib/repo/notes';
import { getLatestVerification, verificationHistory } from '@/lib/repo/verifications';
import { listUsers } from '@/lib/repo/users';
import { qualifyBusiness } from '@/lib/qualification/qualify';
import { getDb, many } from '@/lib/db';
import type { Business, User } from '@/lib/types';
import { Alert, Badge, Card, Value, buttonSecondary } from './ui';
import { DemoBadge, IdentityBadge, WebsiteStatusBadge } from './status';
import { CandidateList, ChannelList, EvidenceList } from './evidence-list';
import { OpeningHoursPanel } from './opening-hours';
import { CallButton } from './call-button';
import { AssignControl, CallOutcomeForm, LeadStatusControl, ManualVerificationForm, NoteForm } from './lead-controls';
import { PromoteControls } from './promote-controls';

/**
 * The full business profile.
 *
 * Deliberately its own design: the layout is organised around what a caller
 * needs — who this is, can we prove it, can we call them, and why do we believe
 * the website status.
 */
export async function BusinessDetail({ business, user }: { business: Business; user: User }) {
  const [lead, verification, history, calls, notes, statuses, rawUsers, photos, sources] = await Promise.all([
    getLeadByBusiness(business.id),
    getLatestVerification(business.id),
    verificationHistory(business.id),
    callHistory(business.id),
    listNotes(business.id),
    listLeadStatuses(),
    listUsers(false),
    getBusinessPhotos(business.id),
    many<{ provider: string; external_id: string; source_url: string | null; fetched_at: number }>(
      getDb(),
      'SELECT provider, external_id, source_url, fetched_at FROM business_sources WHERE business_id = $1 ORDER BY fetched_at DESC',
      [business.id],
    ),
  ]);
  const users = rawUsers.map((u) => ({ id: u.id, name: u.name }));
  const qualification = qualifyBusiness(business);
  const openCall = calls.find((call) => call.outcome === null && call.userId === user.id);

  return (
    <div className="space-y-4">
      <header className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink">{business.name}</h1>
              {business.isDemoData && <DemoBadge />}
              {business.excludedAt && <Badge tone="bad">Excluded</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              <Value>{business.categoryLabel ?? business.category}</Value>
              {business.city && ` · ${business.city}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <WebsiteStatusBadge status={business.websiteStatus} confidence={business.websiteConfidence} />
              <IdentityBadge status={business.identityStatus} confidence={business.identityConfidence} />
              {qualification.qualifies ? (
                <Badge tone="good">Qualifies as a no-website lead</Badge>
              ) : (
                <Badge tone="neutral" title={qualification.blockers.join(' ')}>
                  Does not qualify
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {lead && <CallButton leadId={lead.id} phoneE164={business.phoneE164} label="Call" size="lg" />}
            <a
              href={manualSearchUrl(business.name, business.city)}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonSecondary}
              title="Opens a Google search for this business in a new tab. This page stays open."
            >
              Verify manually ↗
            </a>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Website verification" description={verification?.summary ?? 'Not verified yet.'}>
            {business.websiteUrl && (
              <p className="border-b border-line px-4 py-2 text-sm">
                Website:{' '}
                <a
                  href={business.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-info underline underline-offset-2"
                >
                  {business.websiteUrl}
                </a>
              </p>
            )}
            {business.websiteCheckedAt && (
              <p className="border-b border-line px-4 py-2 text-xs text-ink-muted">
                Last checked {formatDateTime(business.websiteCheckedAt)} ({formatRelative(business.websiteCheckedAt)})
                {verification?.engineVersion && ` · engine ${verification.engineVersion}`}
              </p>
            )}
            <div className="border-b border-line">
              <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Research channels
              </h3>
              <ChannelList channels={verification?.channels ?? []} />
            </div>
            <div className="border-b border-line">
              <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Candidate domains checked
              </h3>
              <CandidateList candidates={verification?.candidates ?? []} />
            </div>
            <div>
              <h3 className="px-4 pt-3 text-xs font-semibold tracking-wide text-ink-soft uppercase">
                Evidence — why this conclusion
              </h3>
              <EvidenceList evidence={verification?.evidence ?? []} />
            </div>
          </Card>

          {lead && openCall && (
            <Card title="Record the call you just made" description="The lead stays in your list either way.">
              <div className="p-4">
                <CallOutcomeForm callId={openCall.id} leadId={lead.id} statuses={statuses} />
              </div>
            </Card>
          )}

          <Card title="Call history" description={`${calls.length} attempt(s) recorded.`}>
            {calls.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">No calls have been recorded for this business.</p>
            ) : (
              <ul className="divide-y divide-line">
                {calls.map((call) => (
                  <li key={call.id} className="px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{call.userName ?? 'Unknown user'}</span>
                      <span className="text-xs text-ink-muted">{formatDateTime(call.startedAt)}</span>
                      {call.outcome ? (
                        <Badge tone="neutral">{call.outcome.replace(/_/g, ' ')}</Badge>
                      ) : (
                        <Badge tone="warn">Outcome not recorded</Badge>
                      )}
                      {call.durationSeconds !== null && (
                        <span className="text-xs text-ink-muted">{call.durationSeconds}s</span>
                      )}
                    </div>
                    {call.note && <p className="mt-1 text-ink-soft">{call.note}</p>}
                    {call.callbackAt && (
                      <p className="mt-1 text-xs text-warn">Callback {formatDateTime(call.callbackAt)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Notes">
            <div className="border-b border-line p-4">
              <NoteForm businessId={business.id} />
            </div>
            {notes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">No notes yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-2.5 text-sm">
                    <p className="text-ink">{note.body}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {note.userName ?? 'Unknown'} · {formatDateTime(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Contact">
            <dl className="divide-y divide-line text-sm">
              <Row label="Phone">
                {business.phoneE164 ? (
                  <a href={`tel:${business.phoneE164}`} className="text-ink underline underline-offset-2">
                    {formatPhone(business.phoneE164)}
                  </a>
                ) : (
                  <Value unknownLabel="No verified phone number">{null}</Value>
                )}
              </Row>
              <Row label="Address">
                <Value unknownLabel="No address on record">
                  {[business.street, business.houseNumber].filter(Boolean).join(' ') || null}
                </Value>
                {(business.postalCode || business.city) && (
                  <div>{[business.postalCode, business.city].filter(Boolean).join(' ')}</div>
                )}
              </Row>
              <Row label="Email">
                <Value unknownLabel="None on record">{business.email}</Value>
              </Row>
              <Row label="Coordinates">
                <Value unknownLabel="Unknown">
                  {business.lat !== null && business.lon !== null
                    ? `${business.lat.toFixed(5)}, ${business.lon.toFixed(5)}`
                    : null}
                </Value>
              </Row>
            </dl>
          </Card>

          <Card title="Opening hours">
            <OpeningHoursPanel
              hours={business.openingHours}
              source={business.openingHoursSource}
              verifiedAt={business.openingHoursVerifiedAt}
            />
          </Card>

          {/* Only rendered when there are actual photos: a card whose whole
              content is "no photo provider is configured" is noise on a page
              a caller reads while someone is picking up the phone. */}
          {photos.photos.length > 0 && (
            <Card title="Photos" description="Real photos from the provider, shown only when they can be tied to this business.">
              <div className="p-4">
                <ul className="grid grid-cols-2 gap-2">
                  {photos.photos.map((photo) => (
                    <li key={photo.providerRef}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={`Photo of ${business.name} supplied by the business data provider`}
                        className="h-28 w-full rounded-md border border-line object-cover"
                        loading="lazy"
                      />
                      {photo.attribution && (
                        <p className="mt-0.5 text-[10px] text-ink-muted">{photo.attribution}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-muted">
                  {photos.attribution} · Shown live from the provider and not stored. Photos are never generated.
                </p>
              </div>
            </Card>
          )}

          <Card title="Lead">
            <div className="space-y-4 p-4">
              {lead ? (
                <>
                  <LeadStatusControl leadId={lead.id} current={lead.status} statuses={statuses} />
                  <AssignControl leadId={lead.id} current={lead.assignedUserId} users={users} />
                  <p className="text-xs text-ink-muted">
                    {lead.callCount} call(s) · last {formatRelative(lead.lastCallAt)} · added {formatRelative(lead.createdAt)}
                  </p>
                  <LeadHistory leadId={lead.id} />
                </>
              ) : (
                <PromoteControls
                  businessId={business.id}
                  qualifies={qualification.qualifies}
                  blockers={qualification.blockers}
                  reasons={qualification.reasons}
                  isAdmin={user.role === 'admin'}
                  isExcluded={business.excludedAt !== null}
                />
              )}
            </div>
          </Card>

          <Card title="Manual verification">
            <div className="p-4">
              <ManualVerificationForm businessId={business.id} />
            </div>
          </Card>

          <Card title="Identity signals" description={`Confidence ${business.identityConfidence}/100.`}>
            <ul className="divide-y divide-line text-sm">
              {business.identitySignals.map((signal) => (
                <li key={signal.key} className="flex items-start justify-between gap-3 px-4 py-2">
                  <div>
                    <p className="text-ink">{signal.label}</p>
                    <p className="text-xs text-ink-muted">
                      <Value unknownLabel="not present">{signal.value}</Value>
                    </p>
                  </div>
                  <Badge tone={signal.present ? 'good' : 'neutral'}>{signal.present ? signal.strength : 'missing'}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Sources" description="Every record that contributed to this business.">
            <ul className="divide-y divide-line text-sm">
              {sources.map((source) => (
                <li key={`${source.provider}-${source.external_id}`} className="px-4 py-2">
                  <p className="text-ink">{source.provider}</p>
                  <p className="text-xs text-ink-muted">
                    {source.external_id} · fetched {formatRelative(source.fetched_at)}
                  </p>
                  {source.source_url && (
                    <a
                      href={source.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-info underline underline-offset-2"
                    >
                      Open source record ↗
                    </a>
                  )}
                </li>
              ))}
              {sources.length === 0 && <li className="px-4 py-2 text-ink-soft">No sources recorded.</li>}
            </ul>
          </Card>

          {history.length > 1 && (
            <Card title="Verification history">
              <ul className="divide-y divide-line text-sm">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-2">
                    <p className="text-ink">{entry.status.replace(/_/g, ' ').toLowerCase()}</p>
                    <p className="text-xs text-ink-muted">
                      confidence {entry.confidence} · {formatDateTime(entry.finished_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {business.excludedAt && (
            <Alert tone="warn" title="This business is excluded">
              {business.exclusionReason ?? 'No reason recorded.'}
            </Alert>
          )}

          {business.branchGroupKey && (
            <p className="text-xs text-ink-muted">
              Other locations with the same name are kept as separate businesses.{' '}
              <Link href={`/pool?q=${encodeURIComponent(business.name)}`} className="underline underline-offset-2">
                Show them
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

async function LeadHistory({ leadId }: { leadId: string }) {
  const history = await leadStatusHistory(leadId);
  if (history.length === 0) return null;
  return (
    <details className="text-xs text-ink-soft">
      <summary className="cursor-pointer">Status history ({history.length})</summary>
      <ul className="mt-1 space-y-1">
        {history.map((entry) => (
          <li key={entry.id}>
            {entry.from_status ? `${entry.from_status} → ` : ''}
            <span className="font-medium text-ink">{entry.to_status}</span> · {entry.user_name ?? 'Unknown'} ·{' '}
            {formatDateTime(entry.created_at)}
            {entry.note && <span className="block text-ink-muted">{entry.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
