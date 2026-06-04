"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EnableDmsCard } from "@/components/dms/EnableDmsCard";
import { SessionGate } from "@/components/auth/SessionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { useXmtp } from "@/components/xmtp/XmtpProvider";
import { authedFetch } from "@/lib/api";
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
      <SessionGate>
        {({ address: me }) => <InboxResolver me={me} inboxId={inboxId} />}
      </SessionGate>
    </div>
  );
}

async function resolveViaBackend(
  me: `0x${string}`,
  inboxId: string,
): Promise<`0x${string}` | null> {
  try {
    const res = await authedFetch(
      me,
      `/api/xmtp/inbox/${encodeURIComponent(inboxId)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { address: string | null };
    return (json.address as `0x${string}` | null) ?? null;
  } catch {
    return null;
  }
}

function InboxResolver({
  me,
  inboxId,
}: {
  me: `0x${string}`;
  inboxId: string;
}) {
  const { status } = useXmtp();
  const router = useRouter();
  const [phase, setPhase] = useState<
    "resolving" | "unresolved" | "error"
  >("resolving");

  useEffect(() => {
    if (status.kind !== "ready") return;
    const client = status.client;
    let cancelled = false;

    // Retry with backoff. Primary path is the backend lookup (our own
    // inbox→address mapping, populated when each attendee enables XMTP);
    // XMTP-API paths are fallbacks for the rare case where the peer
    // hasn't reopened the app since we started recording the mapping.
    const delaysMs = [0, 1_500, 3_000, 5_000, 10_000];

    (async () => {
      for (let i = 0; i < delaysMs.length; i++) {
        if (cancelled) return;
        const delay = delaysMs[i];
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        try {
          // 1) Server-side mapping — deterministic for Dappcon attendees
          //    who have enabled XMTP since the column was added.
          let addr = await resolveViaBackend(me, inboxId);

          // 2) XMTP preferences API + recoveryIdentifier fallback.
          if (!addr) {
            await client.conversations.sync().catch(() => undefined);
            addr = await resolvePeerAddressFromInboxId(client, inboxId);
          }
          // 3) Walk the DM members map directly.
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
  }, [status, inboxId, me, router]);

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
