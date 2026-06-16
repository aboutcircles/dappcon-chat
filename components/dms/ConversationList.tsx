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
import type { Attendee } from "@/lib/types";
import type { Client } from "@xmtp/browser-sdk";
import { IdentifierKind } from "@xmtp/browser-sdk";
import {
  listAllDms,
  loadRescuedConversations,
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
      <XmtpInbox me={me} dmHops={dmHops} filterOn={filterOn} />
    </div>
  );
}

function XmtpInbox({
  me,
  dmHops,
  filterOn,
}: {
  me: `0x${string}`;
  dmHops: number;
  filterOn: boolean;
}) {
  const { status } = useXmtp();
  const [rows, setRows] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  // address → hopsFromMe map sourced from /api/people. Used to decide whether
  // an inbound DM passes the inbox filter or gets folded.
  const [peerHops, setPeerHops] = useState<Map<string, number | null>>(
    new Map(),
  );
  // Conversations the user has actively replied to — they bypass the inbox
  // filter for this device regardless of hop distance.
  const [rescued, setRescued] = useState<Set<string>>(new Set());
  const [filteredOpen, setFilteredOpen] = useState(false);

  const myInboxId = status.kind === "ready" ? status.inboxId : null;
  useEffect(() => {
    if (!myInboxId) return;
    setRescued(loadRescuedConversations(myInboxId));
  }, [myInboxId]);

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
        await refreshPeerHops(me, setPeerHops);
        await resolveMissingAddressesViaBackend(me, next, setRows);
        await crowdsourceUnresolvedFromAttendees(me, client, next, setRows);
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
  }, [status, me]);

  // Safety net: periodically re-list DMs in case the streams missed
  // something (network flake, browser throttle, fresh first-contact race).
  // Cheap because XMTP listDms is local + the sync is incremental.
  //
  // Also self-heals stale rows: rows whose peerAddress was null because
  // XMTP didn't surface an Ethereum identifier (now resolved server-side
  // via our own inbox→address mapping), and rows whose Circles profile
  // was never fetched because the address didn't exist at mount time.
  usePolling(async () => {
    if (status.kind !== "ready") return;
    try {
      const summaries = await listAllDms(status.client);
      let updated: Map<string, Row> | null = null;
      setRows((prev) => {
        const next = new Map(prev);
        for (const s of summaries) {
          const existing = next.get(s.conversationId);
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
      if (updated) {
        await resolveMissingAddressesViaBackend(me, updated, setRows);
        await hydrateProfiles(updated, setRows);
      }
      await refreshPeerHops(me, setPeerHops);
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

  // Partition into in-range vs filtered. A row is in-range when ANY of:
  //   - the user turned the filter off
  //   - the user has explicitly engaged with the convo (rescued set)
  //   - the user sent the most recent message (legacy engagement signal —
  //     covers conversations that pre-date the rescued set)
  //   - the peer's distance is within my dmHops
  const { inRange, filtered } = useMemo(() => {
    const a: Row[] = [];
    const b: Row[] = [];
    for (const row of sorted) {
      const passes =
        !filterOn ||
        rescued.has(row.conversationId) ||
        (myInboxId !== null &&
          row.lastMessageSenderInboxId === myInboxId) ||
        isPeerInRange(row.peerAddress, peerHops, dmHops);
      if (passes) a.push(row);
      else b.push(row);
    }
    return { inRange: a, filtered: b };
  }, [sorted, filterOn, rescued, myInboxId, peerHops, dmHops]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-[20px]" />
        <Skeleton className="h-14 w-full rounded-[20px]" />
      </div>
    );
  }

  if (status.kind !== "ready") return null;

  if (sorted.length === 0) {
    return (
      <div className="space-y-3 py-8">
        <p className="text-center text-base text-ink-muted">
          No conversations yet. Open someone&apos;s profile from the{" "}
          <Link className="text-brand hover:text-brand-press" href="/people">
            People
          </Link>{" "}
          tab to start one.
        </p>
        {status.freshInstall && (
          <div className="mx-auto max-w-prose rounded-[20px] bg-surface p-4 text-sm shadow-card">
            <p className="font-semibold">Re-enabled XMTP on this device?</p>
            <p className="mt-1 text-ink-muted">
              XMTP conversations are stored in this browser. If your local
              data was cleared (browser eviction, new device, fresh
              incognito session) we generated a new installation key under
              your existing inbox. Peers re-welcome your device the next
              time they open the app — your old conversations will
              reappear as that happens, not all at once. Nothing is lost.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {inRange.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          No conversations match your inbox filter.{" "}
          {filtered.length > 0
            ? `Expand "Filtered" below or widen the slider.`
            : "Open someone's profile to start one."}
        </p>
      ) : (
        <ul className="space-y-3">
          {inRange.map((row) => (
            <li key={row.conversationId}>
              <ConversationRow row={row} myInboxId={myInboxId} />
            </li>
          ))}
        </ul>
      )}

      {filtered.length > 0 && filterOn && (
        <section className="rounded-[20px] bg-surface shadow-card">
          <button
            type="button"
            onClick={() => setFilteredOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="text-sm font-semibold">
              Filtered ({filtered.length})
            </span>
            <span className="text-xs text-ink-muted">
              {filteredOpen ? "Hide" : "Show"}
            </span>
          </button>
          {filteredOpen && (
            <ul className="space-y-3 px-3 pb-3">
              {filtered.map((row) => (
                <li key={row.conversationId}>
                  <ConversationRow
                    row={row}
                    myInboxId={myInboxId}
                    muted
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ConversationRow({
  row,
  myInboxId,
  muted = false,
}: {
  row: Row;
  myInboxId: string | null;
  muted?: boolean;
}) {
  return (
    <Link
      href={
        row.peerAddress
          ? `/dms/${row.peerAddress}`
          : `/dms/inbox/${row.peerInboxId}`
      }
      className={
        "flex items-center gap-3 rounded-[20px] bg-surface p-4 shadow-card transition-colors hover:bg-brand-tint/40 " +
        (muted ? "opacity-70 hover:opacity-100" : "")
      }
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
  );
}

function isPeerInRange(
  peerAddress: `0x${string}` | null,
  peerHops: Map<string, number | null>,
  dmHops: number,
): boolean {
  if (!peerAddress) return false;
  const h = peerHops.get(peerAddress.toLowerCase());
  if (h == null) return false;
  return h <= dmHops;
}

async function refreshPeerHops(
  me: `0x${string}`,
  setPeerHops: (map: Map<string, number | null>) => void,
): Promise<void> {
  try {
    const res = await authedFetch(me, "/api/people");
    if (!res.ok) return;
    const json = (await res.json()) as {
      attendees: { address: string; hopsFromMe: number | null }[];
    };
    const next = new Map<string, number | null>();
    for (const a of json.attendees) {
      next.set(a.address.toLowerCase(), a.hopsFromMe);
    }
    setPeerHops(next);
  } catch {
    /* non-fatal — partition just falls back to "out-of-range" until next tick */
  }
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
    ? `Only let people within ${hops} ${hops === 1 ? "hop" : "hops"} of you start a DM`
    : "Open to DMs from anyone";
  return (
    <section className="rounded-[20px] bg-surface p-5 shadow-card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
            Inbox filter
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
        Decide who can start a DM with you. New conversations from people
        further than this stay folded as <em>Filtered</em> below. Once you
        reply, the conversation moves to your main list. Rightmost stop is{" "}
        <em>Anyone</em>. Saved automatically.
      </p>
    </section>
  );
}

/**
 * For rows that lack a peerAddress (XMTP's preferences API didn't surface
 * an Ethereum identifier), ask our backend for the mapping it stored when
 * the peer enabled XMTP. Mutates `rows` in place so a follow-up
 * hydrateProfiles call picks up the new addresses.
 */
async function resolveMissingAddressesViaBackend(
  me: `0x${string}`,
  rows: Map<string, Row>,
  setRows: (
    update: (prev: Map<string, Row>) => Map<string, Row>,
  ) => void,
): Promise<void> {
  const unresolved: Array<{ convId: string; inboxId: string }> = [];
  for (const row of rows.values()) {
    if (!row.peerAddress && row.peerInboxId) {
      unresolved.push({
        convId: row.conversationId,
        inboxId: row.peerInboxId,
      });
    }
  }
  if (unresolved.length === 0) return;
  const updates = await Promise.all(
    unresolved.map(async ({ convId, inboxId }) => {
      try {
        const res = await authedFetch(
          me,
          `/api/xmtp/inbox/${encodeURIComponent(inboxId)}`,
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { address: string | null };
        if (!json.address) return null;
        return { convId, address: json.address as `0x${string}` };
      } catch {
        return null;
      }
    }),
  );
  const resolved = updates.filter(
    (u): u is { convId: string; address: `0x${string}` } => u !== null,
  );
  if (resolved.length === 0) return;
  // Apply to the local in-flight map so the caller's follow-up
  // hydrateProfiles call uses the addresses immediately.
  for (const { convId, address } of resolved) {
    const row = rows.get(convId);
    if (row) rows.set(convId, { ...row, peerAddress: address });
  }
  // And to React state so the row text/link updates without waiting for
  // the next poll.
  setRows((prev) => {
    const next = new Map(prev);
    for (const { convId, address } of resolved) {
      const row = next.get(convId);
      if (row && !row.peerAddress) {
        next.set(convId, { ...row, peerAddress: address });
      }
    }
    return next;
  });
}

/**
 * Last-resort backfill for rows whose peerAddress is still null after the
 * backend lookup: walk the Dappcon attendee directory and ask XMTP for
 * each attendee's inbox ID via the *address → inbox* direction
 * (`fetchInboxIdByIdentifier` — doesn't trigger the EIP-1271 verify path
 * that breaks for Safe-signed peers). When an attendee's derived inbox
 * matches an unresolved row, record the mapping locally + POST it to the
 * backend so future sessions can resolve it without redoing the work.
 */
async function crowdsourceUnresolvedFromAttendees(
  me: `0x${string}`,
  client: Client,
  rows: Map<string, Row>,
  setRows: (
    update: (prev: Map<string, Row>) => Map<string, Row>,
  ) => void,
): Promise<void> {
  const unresolvedByInbox = new Map<string, string[]>(); // inboxId → conversationIds
  for (const row of rows.values()) {
    if (!row.peerAddress && row.peerInboxId) {
      const list = unresolvedByInbox.get(row.peerInboxId) ?? [];
      list.push(row.conversationId);
      unresolvedByInbox.set(row.peerInboxId, list);
    }
  }
  if (unresolvedByInbox.size === 0) return;
  let attendees: (Attendee & { xmtpInboxId: string | null })[];
  try {
    const res = await authedFetch(me, "/api/people");
    if (!res.ok) return;
    const json = (await res.json()) as {
      attendees: (Attendee & { xmtpInboxId: string | null })[];
    };
    attendees = json.attendees;
  } catch {
    return;
  }
  // Prefer attendees we don't already have a mapping for — those are the
  // candidates that could fill the gap. (If the backend already had a
  // mapping, resolveMissingAddressesViaBackend would have used it.)
  const candidates = attendees.filter(
    (a) => !a.xmtpInboxId && a.address !== me,
  );
  const discovered: Array<{ address: `0x${string}`; inboxId: string }> = [];
  for (const attendee of candidates) {
    if (unresolvedByInbox.size === 0) break;
    let inboxId: string | undefined;
    try {
      inboxId = await client.fetchInboxIdByIdentifier({
        identifier: attendee.address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      });
    } catch (err) {
      console.warn("[xmtp] fetchInboxIdByIdentifier failed:", err);
      continue;
    }
    if (!inboxId) continue;
    const convIds = unresolvedByInbox.get(inboxId);
    if (convIds) {
      discovered.push({ address: attendee.address, inboxId });
      unresolvedByInbox.delete(inboxId);
      // Apply to the in-flight map so hydrateProfiles can use it next.
      for (const convId of convIds) {
        const row = rows.get(convId);
        if (row) rows.set(convId, { ...row, peerAddress: attendee.address });
      }
    }
  }
  if (discovered.length === 0) return;
  setRows((prev) => {
    const next = new Map(prev);
    for (const { address, inboxId } of discovered) {
      for (const row of next.values()) {
        if (!row.peerAddress && row.peerInboxId === inboxId) {
          next.set(row.conversationId, { ...row, peerAddress: address });
        }
      }
    }
    return next;
  });
  // Crowdsource: tell the backend so the next user doesn't have to do this
  // walk. Fire-and-forget.
  for (const { address, inboxId } of discovered) {
    void authedFetch(me, "/api/xmtp/inbox-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, inboxId }),
    }).catch(() => undefined);
  }
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
