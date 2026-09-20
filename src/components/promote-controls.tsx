'use client';

import {
  excludeBusinessAction,
  promoteBusinessAction,
  restoreBusinessAction,
  reverifyBusinessAction,
} from '@/app/actions/leads';
import { ActionForm } from './action-form';
import { Alert, buttonPrimary, buttonSecondary, inputClass } from './ui';

/**
 * Promotion is always a human decision, and the reason it is or is not allowed
 * is shown in full rather than hidden behind a disabled button.
 */
export function PromoteControls({
  businessId,
  qualifies,
  blockers,
  reasons,
  isAdmin,
  isExcluded,
}: {
  businessId: string;
  qualifies: boolean;
  blockers: string[];
  reasons: string[];
  isAdmin: boolean;
  isExcluded: boolean;
}) {
  return (
    <div className="space-y-3">
      {qualifies ? (
        <Alert tone="good" title="Ready to prospect">
          <ul className="list-disc pl-4">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="warn" title="Not qualified yet">
          <ul className="list-disc pl-4">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {!isExcluded && (
          <ActionForm
            action={promoteBusinessAction}
            fields={{ businessId }}
            label="Add to lead list"
            className={buttonPrimary}
            pendingLabel="Adding…"
          />
        )}

        {!qualifies && isAdmin && !isExcluded && (
          <ActionForm
            action={promoteBusinessAction}
            fields={{ businessId, force: '1' }}
            label="Add anyway (override)"
            className={buttonSecondary}
            confirm="This business does not meet the qualification rules. Add it anyway? The override is recorded in the audit log."
          />
        )}

        <ActionForm
          action={reverifyBusinessAction}
          fields={{ businessId }}
          label="Re-run verification"
          className={buttonSecondary}
          pendingLabel="Verifying…"
        />

        {isExcluded ? (
          <ActionForm
            action={restoreBusinessAction}
            fields={{ businessId }}
            label="Restore to pool"
            className={buttonSecondary}
          />
        ) : (
          <ActionForm
            action={excludeBusinessAction}
            fields={{ businessId }}
            label="Exclude"
            className={buttonSecondary}
            confirm="Exclude this business from future research and prospecting?"
          >
            <input
              type="text"
              name="reason"
              placeholder="Reason (optional)"
              className={`${inputClass} mb-1`}
              maxLength={200}
            />
          </ActionForm>
        )}
      </div>
    </div>
  );
}
