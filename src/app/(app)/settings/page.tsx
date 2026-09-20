import { requireUser } from '@/lib/auth/current-user';
import { MAX_ACTIVE_USERS, countActiveUsers, listUsers } from '@/lib/repo/users';
import { listLeadStatuses } from '@/lib/repo/leads';
import { describeProviders } from '@/lib/providers/registry';
import { publicConfig } from '@/lib/env';
import { MIN_IDENTITY_CONFIDENCE, MIN_WEBSITE_CONFIDENCE } from '@/lib/qualification/qualify';
import { ACCEPT_THRESHOLD, PROBABLE_THRESHOLD } from '@/lib/website/score';
import { Alert, Badge, Card } from '@/components/ui';
import { CreateUserForm, UserRow } from '@/components/user-admin';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const users = listUsers(true);
  const activeCount = countActiveUsers();
  const statuses = listLeadStatuses();
  const providers = describeProviders();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Team access, data sources and the thresholds the verification engine uses.
        </p>
      </div>

      <Card
        title="Data sources"
        description="A source that is unavailable makes verification more cautious, never more confident."
      >
        <ul className="divide-y divide-line text-sm">
          {Object.entries(providers).map(([key, info]) => (
            <li key={key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {key}: {info.label}
                </p>
                {info.attribution && <p className="text-xs text-ink-muted">{info.attribution}</p>}
                {info.unavailableReason && <p className="mt-0.5 text-xs text-warn">{info.unavailableReason}</p>}
              </div>
              <Badge tone={info.isAvailable ? 'good' : 'warn'}>{info.isAvailable ? 'available' : 'unavailable'}</Badge>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3 text-xs text-ink-soft">
          Change providers and API keys in <code className="font-mono">.env</code>, then restart the app. Keys are
          never sent to the browser.
        </div>
      </Card>

      <Card title="Verification thresholds" description="Why a business does or does not qualify.">
        <dl className="divide-y divide-line text-sm">
          <Threshold
            label="Candidate accepted as this business's website"
            value={`score ≥ ${ACCEPT_THRESHOLD} with a strong signal (phone, address or profile-declared)`}
          />
          <Threshold label="Candidate treated as probable" value={`score ≥ ${PROBABLE_THRESHOLD}`} />
          <Threshold
            label="Channels required before “verified no website”"
            value={`${publicConfig.minChannelsForNoWebsite} completed channels, with none failing or unavailable`}
          />
          <Threshold label="Identity confidence required to qualify" value={`${MIN_IDENTITY_CONFIDENCE}/100 and status “confirmed”`} />
          <Threshold label="Website confidence required to qualify" value={`${MIN_WEBSITE_CONFIDENCE}/100`} />
          <Threshold label="Verification considered stale after" value={`${publicConfig.verificationTtlDays} days`} />
          <Threshold label="Default country / timezone" value={`${publicConfig.defaultCountry} · ${publicConfig.defaultTimezone}`} />
        </dl>
      </Card>

      <Card title="Lead statuses" description="Used across the lead list and the calling workflow.">
        <ul className="flex flex-wrap gap-2 p-4">
          {statuses.map((status) => (
            <li key={status.key}>
              <Badge tone={status.tone}>
                {status.label}
                {status.isTerminal && <span className="font-normal opacity-70">final</span>}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Team"
        description={`${activeCount} of ${MAX_ACTIVE_USERS} seats in use. Everyone shares the research pool and lead list.`}
      >
        {user.role === 'admin' ? (
          <>
            <div className="border-b border-line">
              <CreateUserForm activeCount={activeCount} maxUsers={MAX_ACTIVE_USERS} />
            </div>
            <ul className="divide-y divide-line">
              {users.map((member) => (
                <UserRow key={member.id} user={member} isSelf={member.id === user.id} />
              ))}
            </ul>
          </>
        ) : (
          <div className="space-y-3 p-4">
            <Alert tone="info">Only administrators can manage team members.</Alert>
            <ul className="divide-y divide-line text-sm">
              {users
                .filter((member) => member.isActive)
                .map((member) => (
                  <li key={member.id} className="flex items-center gap-2 py-2">
                    <span className="font-medium text-ink">{member.name}</span>
                    <Badge tone={member.role === 'admin' ? 'accent' : 'neutral'}>{member.role}</Badge>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function Threshold({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
