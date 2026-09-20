import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { SetupForm } from './setup-form';

export const dynamic = 'force-dynamic';

export default function SetupPage() {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (row.n > 0) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">Set up Local Lead List</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Create the first administrator account. You can invite up to three more people afterwards.
          </p>
        </div>
        <div className="card p-6">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
