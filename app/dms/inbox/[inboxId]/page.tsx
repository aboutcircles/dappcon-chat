"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EnableDmsCard } from "@/components/dms/EnableDmsCard";
import { SessionGate } from "@/components/auth/SessionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { useXmtp } from "@/components/xmtp/XmtpProvider";
import { resolvePeerAddressFromInboxId } from "@/lib/xmtp/dms";

/**
 * Fallback DM route keyed by XMTP inbox ID. The conversation list links here
 * when `peerAddress` was null at render time — typically because a freshly
 * streamed-in DM hadn't synced the peer's Ethereum identifier locally yet.
 * We resolve the identifier via the network and redirect to the canonical
 * `/dms/<address>` route. If resolution genuinely fails, render a friendly
 * dead-end with a back link instead of a 404.
 */
export default function DmThreadByInboxPage({
  params,
}: {
  params: Promise<{ inboxId: string }>;
}) {
  const { inboxId } = use(params);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <SessionGate>{() => <InboxResolver inboxId={inboxId} />}</SessionGate>
    </div>
  );
}

function InboxResolver({ inboxId }: { inboxId: string }) {
  const { status } = useXmtp();
  const router = useRouter();
  const [phase, setPhase] = useState<
    "resolving" | "unresolved" | "error"
  >("resolving");

  useEffect(() => {
    if (status.kind !== "ready") return;
    const client = status.client;
    let cancelled = false;
    (async () => {
      try {
        const addr = await resolvePeerAddressFromInboxId(client, inboxId);
        if (cancelled) return;
        if (addr) {
          router.replace(`/dms/${addr}`);
        } else {
          setPhase("unresolved");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, inboxId, router]);

  if (status.kind !== "ready") {
    return (
      <>
        <Link
          href="/dms"
          className="font-mono text-sm text-ink-muted hover:text-ink"
        >
          ← messages
        </Link>
        <EnableDmsCard />
      </>
    );
  }

  return (
    <>
      <Link
        href="/dms"
        className="font-mono text-sm text-ink-muted hover:text-ink"
      >
        ← messages
      </Link>
      {phase === "resolving" && (
        <Skeleton className="h-40 w-full rounded-[20px]" />
      )}
      {phase === "unresolved" && (
        <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-2">
          <p className="text-sm font-semibold">Still syncing this contact</p>
          <p className="text-sm text-ink-muted">
            XMTP hasn&apos;t finished resolving this inbox to a wallet address
            yet. Head back to the DMs list — it&apos;ll appear with their
            Circles profile once the sync catches up.
          </p>
        </div>
      )}
      {phase === "error" && (
        <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-2">
          <p className="text-sm font-semibold">Couldn&apos;t open this DM</p>
          <p className="text-sm text-ink-muted">
            Something went wrong looking up the peer. Try again from the DMs
            list.
          </p>
        </div>
      )}
    </>
  );
}
