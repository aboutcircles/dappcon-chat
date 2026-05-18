import { NavCards } from '@/components/layout/NavCards';
import { ConnectionCard } from '@/components/wallet/ConnectionCard';
import { SignInDemo } from '@/components/wallet/SignInDemo';

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          A minimal Next.js + shadcn starter for Circles miniapps.
        </p>
      </div>

      <ConnectionCard />

      <SignInDemo />

      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">Explore</h2>
        <NavCards />
      </div>
    </div>
  );
}
