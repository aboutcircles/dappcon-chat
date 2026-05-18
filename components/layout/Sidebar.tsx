'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r bg-sidebar p-2 md:block">
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/60',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
