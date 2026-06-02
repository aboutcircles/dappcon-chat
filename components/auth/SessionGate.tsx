"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useSession } from "@/hooks/use-session";

type Props = {
  children: (ctx: {
    address: `0x${string}`;
    refresh: () => Promise<void>;
  }) => ReactNode;
  requireRegistered?: boolean;
};

export function SessionGate({ children, requireRegistered = true }: Props) {
  const { address } = useWallet();
  const { data, loading, refresh } = useSession(
    (address as `0x${string}` | null) ?? null,
  );
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!data?.session) {
      router.replace("/");
      return;
    }
    if (requireRegistered && !data.attendee) {
      router.replace("/register");
    }
  }, [data, loading, requireRegistered, router]);

  if (loading || !data?.session) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (requireRegistered && !data.attendee) {
    return <Skeleton className="h-32 w-full" />;
  }
  return <>{children({ address: data.session.address, refresh })}</>;
}
