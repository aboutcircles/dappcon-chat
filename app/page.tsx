"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { useSession } from "@/hooks/use-session";
import { CIRCLES_INVITATION_URL } from "@/lib/links";

export default function LandingPage() {
  const { address, isConnected } = useWallet();
  const { data, loading, refresh } = useSession(
    (address as `0x${string}` | null) ?? null,
  );
  const router = useRouter();

  useEffect(() => {
    void refresh();
  }, [address, refresh]);

  useEffect(() => {
    if (loading || !data?.session) return;
    if (!data.attendee) router.replace("/register");
    else router.replace("/wall");
  }, [data, loading, router]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Dappcon Chat
        </h1>
        <p className="text-lg text-ink-muted">
          Chat with participants via Circles.
        </p>
      </header>

      {loading && isConnected ? (
        <Skeleton className="h-28 w-full" />
      ) : isConnected ? (
        <p className="text-base text-ink-muted">Loading your space…</p>
      ) : (
        <div className="space-y-4">
          <section className="rounded-[20px] bg-surface p-6 shadow-card">
            <p className="text-base font-semibold">Already on Circles?</p>
            <p className="mt-2 text-base text-ink-muted">
              Log in using your Gnosis App passkey and register as a
              participant.
            </p>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-surface p-6 shadow-card">
            <p className="text-base font-semibold">New to Circles?</p>
            <a
              href={CIRCLES_INVITATION_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "brand" })}
            >
              Create account now
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
