"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { EnableDmsCard } from "@/components/dms/EnableDmsCard";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useXmtp } from "@/components/xmtp/XmtpProvider";
import { usePolling } from "@/hooks/use-polling";
import { useSession } from "@/hooks/use-session";
import { authedFetch } from "@/lib/api";
import { MAX_HOPS } from "@/lib/constants";
import { type ProfileCard } from "@/lib/profile-fetch";
import {
  listAllDms,
  streamAllDmUpdates,
  summarizeDm,
  isTextMessage,
  type DmSummary,
} from "@/lib/xmtp/dms";

type Row = DmSummary & { profile: ProfileCard | null };

export function ConversationList({ me }: { me: `0x${string}` }) {
  void me; // present for symmetry with the rest of the surface contracts
  const { address } = useWallet();
  const { data: meData, refresh: refreshMe } = useSession(me);
  const { status } = useXmtp();

  // DM-gate slider mirrors the wall pattern: debounced save to /api/settings.
  const [dmHops, setDmHops] = useState<number>(2);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (meData?.settings) {
      setDmHops(meData.settings.dmHops);
      seededRef.current = true;
    }
  }, [meData?.settings]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void authedFetch(me, "/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dmHops }),
      }).then(() => refreshMe());
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [dmHops, me, refreshMe]);

  if (!address) return null;
  if (status.kind !== "ready") {
    return (
      <div className="flex flex-col gap-5">
        <GateCard hops={dmHops} onChange={setDmHops} />
        <EnableDmsCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GateCard hops={dmHops} onChange={setDmHops} />
      <XmtpInbox me={me} />
    </div>
  );
}

function XmtpInbox({ me }: { me: `0x${string}` }) {
  void me;
  const { status } = useXmtp();
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);

  // Don't render unless we actually have a client; the parent already checks
  // this but TS narrows better with a guard here.
  useEffect(() => {
    if (status.kind !== "ready") return;
    const client = status.client;

    let cancelled = false;
    let cleanupStreams: (() => void) | null = null;

    (async () => {
      try {
        const summaries = await listAllDms(client);
        if (cancelled) return;
        const next = new Map<string, Row>();
        for (const s of summaries) next.set(s.conversationId, { ...s, profile: null });
        setRows(next);
        await hydrateProfiles(next, setRows);

        cleanupStreams = await streamAllDmUpdates(
          client,
          (summary) => {
            // New conversation appearing — add to map and lazy-load profile.
            setRows((prev) => {
              const m = new Map(prev);
              const existing = m.get(summary.conversationId);
              m.set(summary.conversationId, {
                ...summary,
                profile: existing?.profile ?? null,
              });
              return m;
            });
          },
          async (msg) => {
            if (!isTextMessage(msg)) return;
            const content = typeof msg.content === "string" ? msg.content : "";
            // If the message arrives before we've registered the conversation
            // (race between conv stream and message stream for first
            // contact), re-resolve the DM and add it. Don't drop the message.
            let prevHasRow = false;
            setRows((prev) => {
              prevHasRow = prev.has(msg.conversationId);
              if (!prevHasRow) return prev;
              const existing = prev.get(msg.conversationId)!;
              const sentAtNs = msg.sentAtNs ?? 0n;
              if (sentAtNs <= existing.lastMessageSentAtNs) return prev;
              const m = new Map(prev);
              m.set(msg.conversationId, {
                ...existing,
                lastMessageText: content,
                lastMessageSenderInboxId: msg.senderInboxId,
                lastMessageSentAtNs: sentAtNs,
              });
              return m;
            });
            if (!prevHasRow) {
              // Conversation wasn't in our map — fetch the full Dm and add.
              try {
                const dm = await client.conversations.getDmByInboxId(
                  msg.senderInboxId,
                );
                if (dm) {
                  const s = await summarizeDm(dm);
                  if (s) {
                    setRows((prev) => {
                      const m = new Map(prev);
                      m.set(s.conversationId, { ...s, profile: null });
                      return m;
                    });
                  }
                }
              } catch {
                /* non-fatal */
              }
            }
          },
        );
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load DMs");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanupStreams?.();
    };
  }, [status]);

  // Safety net: periodically re-list DMs in case the streams missed
  // something (network flake, browser throttle, fresh first-contact race).
  // Cheap because XMTP listDms is local + the sync is incremental.
  usePolling(async () => {
    if (status.kind !== "ready") return;
    try {
      const summaries = await listAllDms(status.client);
      setRows((prev) => {
        const next = new Map(prev);
        for (const s of summaries) {
          const existing = next.get(s.conversationId);
          // Don't overwrite the lazy-loaded profile.
          next.set(s.conversationId, {
            ...s,
            profile: existing?.profile ?? null,
          });
        }
        return next;
      });
    } catch {
      /* non-fatal */
    }
  }, 12_000);

  const sorted = useMemo(() => {
    return Array.from(rows.values()).sort((a, b) => {
      const ka = a.lastMessageSentAtNs > 0n ? a.lastMessageSentAtNs : a.createdAtNs;
      const kb = b.lastMessageSentAtNs > 0n ? b.lastMessageSentAtNs : b.createdAtNs;
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    });
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-[20px]" />
        <Skeleton className="h-14 w-full rounded-[20px]" />
      </div>
    );
  }

  if (status.kind !== "ready") return null;

  const myInboxId = status.inboxId;

  if (sorted.length === 0) {
    return (
      <p className="py-10 text-center text-base text-ink-muted">
        No conversations yet. Open someone&apos;s profile from the{" "}
        <Link className="text-brand hover:text-brand-press" href="/people">
          People
        </Link>{" "}
        tab to start one.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {sorted.map((row) => (
        <li key={row.conversationId}>
          <Link
            href={
              row.peerAddress
                ? `/dms/${row.peerAddress}`
                : `/dms/inbox/${row.peerInboxId}`
            }
            className="flex items-center gap-3 rounded-[20px] bg-surface p-4 shadow-card transition-colors hover:bg-brand-tint/40"
          >
            <ProfileAvatar
              src={row.profile?.previewImageUrl ?? row.profile?.imageUrl}
              name={row.profile?.name}
              address={row.peerAddress ?? row.peerInboxId}
              className="size-12"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">
                  {row.peerAddress ? (
                    <ProfileName
                      name={row.profile?.name}
                      address={row.peerAddress}
                    />
                  ) : (
                    row.peerInboxId.slice(0, 8) + "…"
                  )}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  {formatTime(row.lastMessageSentAtNs)}
                </span>
              </div>
              <p className="line-clamp-1 text-sm text-ink-muted">
                {row.lastMessageText
                  ? `${row.lastMessageSenderInboxId === myInboxId ? "You: " : ""}${row.lastMessageText}`
                  : "(no messages yet)"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GateCard({
  hops,
  onChange,
}: {
  hops: number;
  onChange: (v: number) => void;
}) {
  return (
    <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
            Initiation filter
          </p>
          <Label className="text-base font-semibold">
            Only initiate DMs with people within {hops}{" "}
            {hops === 1 ? "hop" : "hops"} of you
          </Label>
        </div>
        <span className="font-mono text-base">{hops}h</span>
      </div>
      <Slider
        value={[hops]}
        min={1}
        max={MAX_HOPS}
        step={1}
        onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? 2) : v)}
      />
      <p className="text-xs text-ink-muted">
        Once a conversation is started, both directions are open. Saved
        automatically.
      </p>
    </section>
  );
}

async function hydrateProfiles(
  initial: Map<string, Row>,
  setRows: (
    update: (prev: Map<string, Row>) => Map<string, Row>,
  ) => void,
): Promise<void> {
  const addresses: `0x${string}`[] = [];
  for (const row of initial.values()) {
    if (row.peerAddress) addresses.push(row.peerAddress);
  }
  if (addresses.length === 0) return;
  try {
    const res = await fetch(`/api/profile-cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addresses }),
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      profiles: Record<string, ProfileCard>;
    };
    setRows((prev) => {
      const next = new Map(prev);
      for (const [id, row] of next) {
        if (!row.peerAddress) continue;
        const card = json.profiles[row.peerAddress.toLowerCase()];
        if (card) next.set(id, { ...row, profile: card });
      }
      return next;
    });
  } catch {
    /* non-fatal — names stay shortened */
  }
}

function formatTime(ns: bigint): string {
  if (ns === 0n) return "—";
  const ms = Number(ns / 1_000_000n);
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return new Date(ms).toLocaleDateString();
}
