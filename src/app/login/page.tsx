import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getDb } from '@/lib/db';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

function hasAnyUser(): boolean {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n > 0;
}

export default async function LoginPage() {
  if (!hasAnyUser()) redirect('/setup');
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">NEXA Leads</h1>
          <p className="mt-1 text-sm text-ink-soft">Private research and calling workspace.</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">
          Sessions last 14 days and are stored on the server. Sign out to end one immediately.
        </p>
      </div>
    </main>
  );
}
