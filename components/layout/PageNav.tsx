'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function PageNav() {
  const pathname = usePathname();

  const currentIndex = NAV.findIndex((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );

  if (currentIndex < 0) return null;

  const prev = currentIndex > 0 ? NAV[currentIndex - 1] : null;
  const next = currentIndex < NAV.length - 1 ? NAV[currentIndex + 1] : null;

  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Page navigation"
      className="mt-8 grid gap-3 border-t pt-6 sm:grid-cols-2"
    >
      {prev ? (
        <PageNavLink direction="prev" href={prev.href} label={prev.label} />
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <PageNavLink direction="next" href={next.href} label={next.label} />
      ) : (
        <span className="hidden sm:block" />
      )}
    </nav>
  );
}

function PageNavLink({
  direction,
  href,
  label,
}: {
  direction: 'prev' | 'next';
  href: string;
  label: string;
}) {
  const isNext = direction === 'next';
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col rounded-lg border p-4 transition-colors hover:bg-accent/40',
        isNext ? 'sm:text-right sm:col-start-2' : '',
      )}
    >
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {!isNext && <ArrowLeft className="size-3" />}
        {isNext ? 'Next' : 'Previous'}
        {isNext && <ArrowRight className="size-3" />}
      </span>
      <span className="mt-1 text-sm font-semibold tracking-tight">{label}</span>
    </Link>
  );
}
