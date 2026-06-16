"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { authedFetch } from "@/lib/api";
import type { ProfileCard } from "@/lib/profile-fetch";
import type { Attendee, AttendanceMode } from "@/lib/types";
import { shortenAddress } from "@/lib/utils";

type Response = {
  me: `0x${string}`;
  target: `0x${string}`;
  profile: ProfileCard;
  attendee: Attendee | null;
  hopsFromMe: number | null;
  theirDmHops: number;
  theirDmFilterOn: boolean;
  myDmHops: number;
  myDmFilterOn: boolean;
  canDm: boolean;
};

export function PersonDetail({
  me,
  address,
}: {
  me: `0x${string}`;
  address: string;
}) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(me, `/api/people/${address}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(err?.error ?? `Failed (${res.status})`);
        }
        const json = (await res.json()) as Response;
        if (!cancelled) setData(json);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, address]);

  if (loading) {
    return <Skeleton className="h-40 w-full rounded-[20px]" />;
  }
  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Couldn&apos;t load this profile.
      </p>
    );
  }

  const isMe = data.target === data.me;

  return (
    <>
      <Link
        href="/people"
        className="font-mono text-[11px] text-ink-muted hover:text-ink"
      >
        ← people
      </Link>

      <div className="rounded-[20px] bg-surface p-6 space-y-5 shadow-card">
        <div className="flex gap-4">
          <ProfileAvatar
            src={data.profile.previewImageUrl ?? data.profile.imageUrl}
            name={data.profile.name}
            address={data.target}
            className="size-16"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate text-xl font-bold">
                <ProfileName name={data.profile.name} address={data.target} />
              </h1>
            </div>
            <p className="font-mono text-[11px] text-ink-muted">
              {shortenAddress(data.target)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.attendee ? (
                <ModeTag mode={data.attendee.mode} />
              ) : (
                <Tag muted>not registered</Tag>
              )}
              {isMe ? (
                <Tag>you</Tag>
              ) : data.hopsFromMe == null ? (
                <Tag muted>far</Tag>
              ) : data.hopsFromMe === 0 ? null : (
                <Tag>{data.hopsFromMe}h</Tag>
              )}
            </div>
          </div>
        </div>

        {(data.attendee?.bio || data.profile.description) && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
            {data.attendee?.bio || data.profile.description}
          </p>
        )}

        {data.attendee && data.attendee.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.attendee.interests.map((i) => (
              <span
                key={i}
                className="rounded-full bg-hairline px-3 py-1 text-[11px] font-medium"
              >
                {i}
              </span>
            ))}
          </div>
        )}
      </div>

      {!isMe && <DmGate data={data} />}
    </>
  );
}

function DmGate({ data }: { data: Response }) {
  // The recipient's filter gates inbound DMs — when I open someone's profile,
  // I see whether THEY allow me to start a conversation. (XMTP itself doesn't
  // enforce a hop policy, but this is the in-app convention. Once a
  // conversation exists, both directions are always open.)
  //
  // Use canDm from the API — it already accounts for "filter off" + distance.
  if (data.canDm) {
    return (
      <Link
        href={`/dms/${data.target}`}
        className={buttonVariants({ variant: "brand" })}
      >
        Open conversation →
      </Link>
    );
  }
  const hops = data.theirDmHops;
  return (
    <div className="space-y-2 rounded-[20px] bg-surface p-4 text-sm shadow-card">
      <p className="font-semibold">
        They aren&apos;t accepting DMs from here
      </p>
      <p className="text-ink-muted">
        {data.hopsFromMe == null
          ? `They only accept DMs from people within ${hops} ${hops === 1 ? "hop" : "hops"} of them, and there's no trust path within that range.`
          : `They only accept DMs from people within ${hops} ${hops === 1 ? "hop" : "hops"} of them — you're ${data.hopsFromMe} away.`}{" "}
        Try posting on the wall to get on their radar.
      </p>
    </div>
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        cls
      }
    >
      {mode === "in-person" ? "in-person" : "online"}
    </span>
  );
}
