"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { usePolling } from "@/hooks/use-polling";
import { useSession } from "@/hooks/use-session";
import { authedFetch } from "@/lib/api";
import { MAX_HOPS } from "@/lib/constants";
import type { ProfileCard } from "@/lib/profile-fetch";
import type { DirectMessage } from "@/lib/types";

type Row = {
  peer: `0x${string}`;
  lastMessage: DirectMessage;
  profile: ProfileCard | null;
};

export function ConversationList({ me }: { me: `0x${string}` }) {
  const { data: meData, refresh: refreshMe } = useSession(me);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  // DM gate slider state (seeded from settings, debounced save)
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

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const res = await authedFetch(me, "/api/dms");
        if (!res.ok) throw new Error("Failed to load");
        const json = (await res.json()) as { conversations: Row[] };
        const sorted = [...json.conversations].sort(
          (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt,
        );
        setRows(sorted);
      } catch (err) {
        if (!opts.silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load DMs");
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [me],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh the inbox every 10s while visible.
  usePolling(() => load({ silent: true }), 10_000);

  return (
    <div className="flex flex-col gap-5">
      <GateCard hops={dmHops} onChange={setDmHops} />

      {loading && !rows ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-[20px]" />
          <Skeleton className="h-14 w-full rounded-[20px]" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="py-10 text-center text-base text-ink-muted">
          No conversations yet. Open someone&apos;s profile from the{" "}
          <Link className="text-brand hover:text-brand-press" href="/people">
            People
          </Link>{" "}
          tab to start.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.peer}>
              <Link
                href={`/dms/${row.peer}`}
                className="flex items-center gap-3 rounded-[20px] bg-surface p-4 shadow-card transition-colors hover:bg-brand-tint/40"
              >
                <ProfileAvatar
                  src={row.profile?.previewImageUrl ?? row.profile?.imageUrl}
                  name={row.profile?.name}
                  address={row.peer}
                  className="size-12"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">
                      <ProfileName
                        name={row.profile?.name}
                        address={row.peer}
                      />
                    </span>
                    <span className="font-mono text-xs text-ink-muted">
                      {formatTime(row.lastMessage.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-sm text-ink-muted">
                    {row.lastMessage.from === me ? "You: " : ""}
                    {row.lastMessage.content}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
            Who can DM you
          </p>
          <p className="text-base font-semibold">
            Within {hops} {hops === 1 ? "hop" : "hops"} of you on Circles
          </p>
        </div>
        <span className="font-mono text-base">
          {hops}h
        </span>
      </div>
      <Slider
        value={[hops]}
        min={1}
        max={MAX_HOPS}
        step={1}
        onValueChange={(v) =>
          onChange(Array.isArray(v) ? (v[0] ?? 2) : v)
        }
      />
      <p className="text-xs text-ink-muted">
        Decide who can DM you based on how connected they are on Circles.
        Saved automatically.
      </p>
    </section>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString();
}
