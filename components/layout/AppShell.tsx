import type { ReactNode } from 'react';

import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-rows-[3.5rem_1fr] md:grid-cols-[240px_1fr]">
      <Header />
      <Sidebar />
      <main className="overflow-auto p-6">{children}</main>
    </div>
  );
}
