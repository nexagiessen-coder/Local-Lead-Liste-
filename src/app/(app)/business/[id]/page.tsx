import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/current-user';
import { getBusiness } from '@/lib/repo/businesses';
import { BusinessDetail } from '@/components/business-detail';
import { buttonQuiet } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const business = getBusiness(id);
  if (!business) notFound();

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/pool" className={buttonQuiet}>
          ← Research pool
        </Link>
        <Link href="/leads" className={buttonQuiet}>
          ← Leads
        </Link>
        <Link href="/call" className={buttonQuiet}>
          ← Call queue
        </Link>
      </nav>
      <BusinessDetail business={business} user={user} />
    </div>
  );
}
