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

const OFF_POSITION = MAX_HOPS + 1;

export function ConversationList({ me }: { me: `0x${string}` }) {
  void me; // present for symmetry with the rest of the surface contracts
  const { address } = useWallet();
  const { data: meData, refresh: refreshMe } = useSession(me);
  const { status } = useXmtp();

  // DM-gate slider mirrors the wall pattern: 1..MAX_HOPS is "filter on at N
  // hops"; the rightmost stop (MAX_HOPS + 1) toggles the filter off so anyone
  // can DM you regardless of distance. Debounced save to /api/settings.
  const [dmHops, setDmHops] = useState<number>(2);
  const [filterOn, setFilterOn] = useState(true);
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (meData?.settings) {
      setDmHops(meData.settings.dmHops);
      setFilterOn(meData.settings.dmFilterOn ?? true);
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
        body: JSON.stringify({ dmHops, dmFilterOn: filterOn }),
      }).then(() => refreshMe());
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [dmHops, filterOn, me, refreshMe]);

  const sliderValue = filterOn ? dmHops : OFF_POSITION;
  function onSliderChange(v: number) {
    if (v >= OFF_POSITION) {
      setFilterOn(false);
    } else {
      setFilterOn(true);
      setDmHops(v);
    }
  }

  if (!address) return null;
  if (status.kind !== "ready") {
    return (
      <div className="flex flex-col gap-5">
        <GateCard
          sliderValue={sliderValue}
          onChange={onSliderChange}
          filterOn={filterOn}
          hops={dmHops}
        />
        <EnableDmsCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <GateCard
        sliderValue={sliderValue}
        onChange={onSliderChange}
        filterOn={filterOn}
        hops={dmHops}
      />
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
                  const s = await summarizeDm(dm, client);
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
  //
  // Also self-heals two stale states from the first listing: rows whose
  // peerAddress was null because the peer's identifier hadn't synced yet
  // (now resolved via the network-refresh fallback in `peerAddressOf`),
  // and rows whose Circles profile was never fetched because the address
  // didn't exist at mount time.
  usePolling(async () => {
    if (status.kind !== "ready") return;
    try {
      const summaries = await listAllDms(status.client);
      let updated: Map<string, Row> | null = null;
      setRows((prev) => {
        const next = new Map(prev);
        for (const s of summaries) {
          const existing = next.get(s.conversationId);
          // Preserve cached profile only when the peer hasn't changed —
          // otherwise drop it so hydrateProfiles re-fetches the new one.
          const keepProfile =
            existing?.peerAddress &&
            existing.peerAddress === s.peerAddress;
          next.set(s.conversationId, {
            ...s,
            profile: keepProfile ? existing.profile : null,
          });
        }
        updated = next;
        return next;
      });
      if (updated) await hydrateProfiles(updated, setRows);
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
  sliderValue,
  onChange,
  filterOn,
  hops,
}: {
  sliderValue: number;
  onChange: (v: number) => void;
  filterOn: boolean;
  hops: number;
}) {
  const label = filterOn
    ? `Within ${hops} ${hops === 1 ? "hop" : "hops"}`
    : "Anyone";
  const headline = filterOn
    ? `Only initiate DMs with people within ${hops} ${hops === 1 ? "hop" : "hops"} of you`
    : "Open to DMs from anyone";
  return (
    <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
            Initiation filter
          </p>
          <Label className="text-base font-semibold">{headline}</Label>
        </div>
        <span className="font-mono text-base">{label}</span>
      </div>
      <Slider
        value={[sliderValue]}
        min={1}
        max={OFF_POSITION}
        step={1}
        onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? 2) : v)}
      />
      <p className="text-xs text-ink-muted">
        Rightmost stop is <em>Anyone</em> — open to DMs regardless of
        trust-graph distance. Once a conversation is started, both directions
        are open. Saved automatically.
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
  // Skip rows we already have a profile for — keeps the polling tick cheap.
  const addresses: `0x${string}`[] = [];
  for (const row of initial.values()) {
    if (row.peerAddress && !row.profile) addresses.push(row.peerAddress);
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
