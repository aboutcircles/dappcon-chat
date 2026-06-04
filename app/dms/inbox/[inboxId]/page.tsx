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

    // Retry with exponential-ish backoff because the peer's identifier may
    // need a few seconds to surface on the network after a first-contact
    // DM. Total wall time ~30s. We also sync the conversation list once
    // before each attempt so getDmByInboxId works as a secondary path.
    const delaysMs = [0, 1_500, 3_000, 5_000, 10_000];

    (async () => {
      for (let i = 0; i < delaysMs.length; i++) {
        if (cancelled) return;
        const delay = delaysMs[i];
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        try {
          await client.conversations.sync().catch(() => undefined);
          let addr = await resolvePeerAddressFromInboxId(client, inboxId);
          // Second path: walk the DM directly. members() can surface the
          // address when preferences hasn't refreshed yet.
          if (!addr) {
            try {
              const dm = await client.conversations.getDmByInboxId(inboxId);
              if (dm) {
                const members = await dm.members();
                const peer = members.find((m) => m.inboxId === inboxId);
                const id = peer?.accountIdentifiers?.find(
                  (j) => j.identifierKind === 0, // IdentifierKind.Ethereum
                )?.identifier;
                if (id) addr = id as `0x${string}`;
              }
            } catch {
              /* non-fatal */
            }
          }
          if (cancelled) return;
          if (addr) {
            router.replace(`/dms/${addr}`);
            return;
          }
        } catch (err) {
          console.warn("[xmtp] inbox resolve attempt failed:", err);
        }
      }
      if (!cancelled) setPhase("unresolved");
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
        <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
          <p className="text-sm font-semibold">Couldn&apos;t resolve this contact</p>
          <p className="text-sm text-ink-muted">
            XMTP hasn&apos;t mapped this inbox to a wallet address after
            several retries. The peer may be on a non-Circles XMTP client, or
            their identity hasn&apos;t propagated yet.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm font-semibold text-brand hover:text-brand-press"
          >
            Try again
          </button>
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
