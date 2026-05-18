import Link from 'next/link';

import { CirclesLogo } from '@/components/brand/CirclesLogo';
import { CurrentPage } from '@/components/layout/CurrentPage';
import { MobileNav } from '@/components/layout/MobileNav';
import { WalletStatus } from '@/components/wallet/WalletStatus';

export function Header() {
  return (
    <header className="col-span-full flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <MobileNav />
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <CirclesLogo width={28} height={28} />
          <span className="hidden sm:inline">Miniapp Boilerplate</span>
        </Link>
        <CurrentPage />
      </div>
      <WalletStatus />
    </header>
  );
}
