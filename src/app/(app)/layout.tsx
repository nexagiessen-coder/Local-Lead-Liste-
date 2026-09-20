import Link from 'next/link';
import { requireUser } from '@/lib/auth/current-user';
import { logoutAction } from '@/app/login/actions';
import { isDemoMode, publicConfig } from '@/lib/env';
import { NavLinks } from '@/components/nav-links';
import { buttonQuiet } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-subtle">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/dashboard" className="text-sm font-semibold text-ink">
            NEXA Leads
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-ink-soft sm:inline">
              {user.name}
              {user.role === 'admin' && <span className="ml-1 text-ink-muted">(admin)</span>}
            </span>
            <form action={logoutAction}>
              <button type="submit" className={buttonQuiet}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {isDemoMode && (
        <div className="border-b border-warn/20 bg-warn-soft px-4 py-2 text-center text-xs text-warn">
          <strong className="font-semibold">Demo mode.</strong> Discovery provider:{' '}
          <code className="font-mono">{publicConfig.discoveryProvider}</code>. All businesses shown come from the
          built-in demo dataset and are not real research results. Configure a real provider in{' '}
          <code className="font-mono">.env</code> before prospecting.
        </div>
      )}

      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6">
        {children}
      </main>
    </div>
  );
}
