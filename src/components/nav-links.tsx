'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/research', label: 'Research' },
  { href: '/pool', label: 'Research pool' },
  { href: '/leads', label: 'Leads' },
  { href: '/call', label: 'Call queue' },
  { href: '/settings', label: 'Settings' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap items-center gap-1">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
                  active ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-subtle hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
