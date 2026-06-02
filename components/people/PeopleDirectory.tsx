"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { authedFetch } from "@/lib/api";
import type { ProfileCard } from "@/lib/profile-fetch";
import { TAG_OPTIONS, type TagOption } from "@/lib/tags";
import type { Attendee, AttendanceMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = Attendee & {
  hopsFromMe: number | null;
  profile: ProfileCard | null;
};

type Response = {
  feedHops: number;
  dmHops: number;
  attendees: Row[];
};

const VERY_FAR = Number.POSITIVE_INFINITY;

export function PeopleDirectory({ me }: { me: `0x${string}` }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [inPersonOnly, setInPersonOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<TagOption[]>([]);

  function toggleTag(tag: TagOption) {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(me, "/api/people");
        if (!res.ok) throw new Error("Failed to load");
        const json = (await res.json()) as Response;
        if (!cancelled) setData(json);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load people",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  const visible = useMemo(() => {
    if (!data) return [];
    let filtered = data.attendees;
    if (inPersonOnly) {
      filtered = filtered.filter((a) => a.mode === "in-person");
    }
    if (tagFilter.length > 0) {
      // OR semantics — match any selected tag. More forgiving than AND for a
      // small attendee pool.
      filtered = filtered.filter((a) =>
        a.interests.some((i) => tagFilter.includes(i as TagOption)),
      );
    }
    return [...filtered].sort((a, b) => {
      // self first, then by hop distance ascending, unreachable last
      const ka = a.address === me ? -1 : a.hopsFromMe ?? VERY_FAR;
      const kb = b.address === me ? -1 : b.hopsFromMe ?? VERY_FAR;
      if (ka !== kb) return ka - kb;
      return a.registeredAt - b.registeredAt;
    });
  }, [data, inPersonOnly, tagFilter, me]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-16 w-full rounded-[20px]" />
        <Skeleton className="h-16 w-full rounded-[20px]" />
      </div>
    );
  }
  if (!data) return null;

  const someoneIsFiltered = inPersonOnly || tagFilter.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-surface p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Filter by</p>
          {someoneIsFiltered && (
            <button
              type="button"
              onClick={() => {
                setInPersonOnly(false);
                setTagFilter([]);
              }}
              className="text-xs text-ink-muted hover:text-ink"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="In person"
            active={inPersonOnly}
            onClick={() => setInPersonOnly((v) => !v)}
          />
          {TAG_OPTIONS.map((tag) => (
            <FilterChip
              key={tag}
              label={tag}
              active={tagFilter.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          Sorted by trust-graph distance.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-base text-ink-muted">
          {someoneIsFiltered
            ? "Nobody matches these filters."
            : "No one's registered yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <PersonRow key={row.address} row={row} me={me} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-brand text-brand-foreground"
          : "bg-hairline text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function PersonRow({ row, me }: { row: Row; me: `0x${string}` }) {
  const isMe = row.address === me;
  return (
    <li>
      <Link
        href={`/people/${row.address}`}
        className="flex items-center gap-3 rounded-[20px] bg-surface p-4 shadow-card transition-colors hover:bg-brand-tint/40"
      >
        <ProfileAvatar
          src={row.profile?.previewImageUrl ?? row.profile?.imageUrl}
          name={row.profile?.name}
          address={row.address}
          className="size-12"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold">
              <ProfileName name={row.profile?.name} address={row.address} />
            </span>
            <ModeTag mode={row.mode} />
            {isMe ? (
              <Tag>you</Tag>
            ) : row.hopsFromMe != null ? (
              <Tag>{row.hopsFromMe}h</Tag>
            ) : (
              <Tag muted>far</Tag>
            )}
          </div>
          {(row.bio || row.profile?.description) && (
            <p className="line-clamp-1 text-sm text-ink-muted">
              {row.bio || row.profile?.description}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function Tag({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
        (muted
          ? "bg-hairline text-ink-muted"
          : "bg-brand-tint text-brand-press")
      }
    >
      {children}
    </span>
  );
}

function ModeTag({ mode }: { mode: AttendanceMode }) {
  const cls =
    mode === "in-person"
      ? "bg-tag-social text-white"
      : "bg-tag-app text-white";
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
        cls
      }
    >
      {mode === "in-person" ? "in-person" : "online"}
    </span>
  );
}
