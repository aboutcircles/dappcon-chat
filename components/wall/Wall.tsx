"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, SmilePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { usePolling } from "@/hooks/use-polling";
import { useSession } from "@/hooks/use-session";
import { authedFetch } from "@/lib/api";
import { MAX_HOPS } from "@/lib/constants";
import type { ProfileCard } from "@/lib/profile-fetch";
import { REACTION_EMOJIS, type AttendanceMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type ReactionSummary = { emoji: string; count: number; mine: boolean };

type FeedPostBase = {
  id: string;
  author: `0x${string}`;
  content: string;
  createdAt: number;
  hopsFromMe: number | null;
  profile: ProfileCard | null;
  mode: AttendanceMode | null;
  reactions: ReactionSummary[];
};

type FeedReply = FeedPostBase;

type FeedPost = FeedPostBase & {
  replyCount: number;
  replies: FeedReply[];
};

type FeedResponse = {
  feedHops: number;
  filter: "on" | "off";
  posts: FeedPost[];
  totalUnfiltered: number;
};

const OFF_POSITION = MAX_HOPS + 1;

export function Wall({ me }: { me: `0x${string}` }) {
  const { data: meData, refresh: refreshMe } = useSession(me);
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hops, setHops] = useState<number>(2);
  const [filterOn, setFilterOn] = useState(true);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (meData?.settings) {
      setHops(meData.settings.feedHops);
      setFilterOn(meData.settings.feedFilterOn ?? true);
      seededRef.current = true;
    }
  }, [meData?.settings]);

  const load = useCallback(
    async (filterOnNow: boolean, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const res = await authedFetch(
          me,
          `/api/posts?filter=${filterOnNow ? "on" : "off"}`,
        );
        if (!res.ok) throw new Error("Failed to load");
        const json = (await res.json()) as FeedResponse;
        setData(json);
      } catch (err) {
        if (!opts.silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load wall");
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [me],
  );

  useEffect(() => {
    void load(filterOn);
  }, [load, filterOn, hops]);

  // Auto-refresh the feed every 15s while the tab is visible.
  usePolling(() => load(filterOn, { silent: true }), 15_000);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!seededRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void authedFetch(me, "/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feedHops: hops, feedFilterOn: filterOn }),
      }).then(() => refreshMe());
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hops, filterOn, me, refreshMe]);

  async function submit() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await authedFetch(me, "/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? `Failed (${res.status})`);
      }
      setContent("");
      await load(filterOn, { silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  const sliderValue = filterOn ? hops : OFF_POSITION;
  function onSliderChange(v: number) {
    if (v >= OFF_POSITION) {
      setFilterOn(false);
    } else {
      setFilterOn(true);
      setHops(v);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        sliderValue={sliderValue}
        onChange={onSliderChange}
        filterOn={filterOn}
        hops={hops}
        shown={data?.posts.length}
        total={data?.totalUnfiltered}
      />

      <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-3">
        <Textarea
          placeholder="Say hi, recommend a talk, share a meetup spot…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={200}
          className="resize-none border-none bg-transparent p-0 text-base focus-visible:ring-0 shadow-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted">{content.length}/200</span>
          <Button
            onClick={submit}
            disabled={submitting || !content.trim()}
            variant="brand"
          >
            {submitting ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>

      {loading && !data && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-[20px]" />
          <Skeleton className="h-28 w-full rounded-[20px]" />
        </div>
      )}

      {data && data.posts.length === 0 && (
        <p className="py-10 text-center text-base text-ink-muted">
          {filterOn ? (
            <>
              Nothing in range. Slide the filter to{" "}
              <button
                type="button"
                onClick={() => onSliderChange(OFF_POSITION)}
                className="text-brand hover:text-brand-press"
              >
                All
              </button>{" "}
              to see every post.
            </>
          ) : (
            "No posts yet."
          )}
        </p>
      )}

      <div className="space-y-3">
        {data?.posts.map((post) => (
          <PostThread
            key={post.id}
            post={post}
            me={me}
            onMutate={() => load(filterOn)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterBar({
  sliderValue,
  onChange,
  filterOn,
  hops,
  shown,
  total,
}: {
  sliderValue: number;
  onChange: (v: number) => void;
  filterOn: boolean;
  hops: number;
  shown: number | undefined;
  total: number | undefined;
}) {
  const label = filterOn
    ? `Within ${hops} hop${hops === 1 ? "" : "s"}`
    : "All posts";
  return (
    <div className="sticky top-0 z-10 -mx-5 sm:-mx-8 bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70 px-5 sm:px-8 py-4 border-b border-hairline space-y-2">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">
          Filter
        </span>
        <Slider
          value={[sliderValue]}
          min={1}
          max={OFF_POSITION}
          step={1}
          onValueChange={(v) =>
            onChange(Array.isArray(v) ? (v[0] ?? 2) : v)
          }
          className="flex-1"
        />
        <span className="shrink-0 text-sm font-medium text-ink-muted w-[96px] text-right">
          {label}
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        Decide whose posts you see based on how connected you are on Circles.
        Rightmost stop is <em>All</em>.{" "}
        {shown != null && total != null && filterOn && (
          <span>· showing {shown} of {total}</span>
        )}
      </p>
    </div>
  );
}

function PostThread({
  post,
  me,
  onMutate,
}: {
  post: FeedPost;
  me: `0x${string}`;
  onMutate: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <article className="rounded-[20px] bg-surface p-5 shadow-card space-y-4">
      <PostHeadBody post={post} isMine={post.author === me} showHops />

      {/* Actions: Reply + thread toggle live above the reactions row so the
          emojis always get a full-width line of their own. */}
      <div className="flex items-center gap-5 text-sm text-ink-muted">
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 py-1 hover:text-ink"
        >
          <MessageSquare className="size-4" />
          {replyOpen ? "Cancel" : "Reply"}
        </button>
        {post.replyCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="py-1 hover:text-ink"
          >
            {expanded
              ? "Hide replies"
              : `${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}`}
          </button>
        )}
      </div>

      {replyOpen && (
        <ReplyComposer
          me={me}
          parentId={post.id}
          onPosted={async () => {
            setReplyOpen(false);
            setExpanded(true);
            await onMutate();
          }}
        />
      )}

      {expanded && post.replies.length > 0 && (
        <div className="space-y-4 border-l-2 border-hairline pl-4 ml-1">
          {post.replies.map((r) => (
            <Reply
              key={r.id}
              reply={r}
              isMine={r.author === me}
              me={me}
              onMutate={onMutate}
            />
          ))}
        </div>
      )}

      {/* Reactions on a dedicated bottom row — enough room for all six pills
          plus the picker, wraps gracefully if it ever runs out of width. */}
      <ReactionRow
        postId={post.id}
        reactions={post.reactions}
        me={me}
        onChanged={onMutate}
      />
    </article>
  );
}

function Reply({
  reply,
  isMine,
  me,
  onMutate,
}: {
  reply: FeedReply;
  isMine: boolean;
  me: `0x${string}`;
  onMutate: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <PostHeadBody post={reply} isMine={isMine} showHops={false} />
      <ReactionRow
        postId={reply.id}
        reactions={reply.reactions}
        me={me}
        onChanged={onMutate}
      />
    </div>
  );
}

function PostHeadBody({
  post,
  isMine,
  showHops,
}: {
  post: FeedPostBase;
  isMine: boolean;
  showHops: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Link href={`/people/${post.author}`} aria-label="View profile">
        <ProfileAvatar
          src={post.profile?.previewImageUrl ?? post.profile?.imageUrl}
          name={post.profile?.name}
          address={post.author}
          className="size-11"
        />
      </Link>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/people/${post.author}`}
            className="text-[15px] font-semibold hover:underline"
          >
            <ProfileName name={post.profile?.name} address={post.author} />
          </Link>
          {post.mode && <ModeTag mode={post.mode} />}
          {showHops &&
            (isMine ? (
              <Tag>you</Tag>
            ) : post.hopsFromMe != null ? (
              <Tag>{post.hopsFromMe}h</Tag>
            ) : null)}
          <span className="text-xs text-ink-muted">
            · {formatTime(post.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
          {post.content}
        </p>
      </div>
    </div>
  );
}

function ReplyComposer({
  me,
  parentId,
  onPosted,
}: {
  me: `0x${string}`;
  parentId: string;
  onPosted: () => void | Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="rounded-[14px] bg-canvas p-3 space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        maxLength={200}
        placeholder="Reply…"
        className="resize-none border-none bg-transparent p-0 text-base focus-visible:ring-0 shadow-none"
      />
      <div className="flex justify-end">
        <Button
          variant="brand"
          size="sm"
          disabled={submitting || !content.trim()}
          onClick={async () => {
            setSubmitting(true);
            try {
              const res = await authedFetch(me, "/api/posts", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ content, parentId }),
              });
              if (!res.ok) {
                const err = (await res.json().catch(() => null)) as {
                  error?: string;
                } | null;
                throw new Error(err?.error ?? `Failed (${res.status})`);
              }
              setContent("");
              await onPosted();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to reply",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Posting…" : "Reply"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Reactions row. Compact: shows only emojis that someone has selected. The
 * bottom-right SmilePlus button opens a popover with the full palette.
 */
function ReactionRow({
  postId,
  reactions,
  me,
  onChanged,
}: {
  postId: string;
  reactions: ReactionSummary[];
  me: `0x${string}`;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  async function toggle(emoji: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await authedFetch(me, `/api/reactions/${postId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error("Failed to react");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to react");
    } finally {
      setBusy(false);
      setPickerOpen(false);
    }
  }

  const used = reactions.filter((r) => r.count > 0);

  return (
    <div
      ref={wrapRef}
      className="relative flex flex-wrap items-center gap-1.5"
    >
      {used.map((entry) => (
        <button
          key={entry.emoji}
          type="button"
          onClick={() => toggle(entry.emoji)}
          disabled={busy}
          aria-label={`React ${entry.emoji}`}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors",
            entry.mine
              ? "bg-brand-tint border-brand text-brand-press"
              : "bg-surface border-hairline hover:bg-hairline/60",
          )}
        >
          <span aria-hidden>{entry.emoji}</span>
          <span className="font-mono text-xs">{entry.count}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        disabled={busy}
        aria-label="Add reaction"
        className="inline-flex size-8 items-center justify-center rounded-full border border-transparent text-ink-muted transition-colors hover:bg-hairline/60 hover:text-ink"
      >
        <SmilePlus className="size-4" />
      </button>

      {pickerOpen && (
        <div
          role="dialog"
          className="absolute bottom-full right-0 mb-2 flex gap-1 rounded-full bg-surface px-2 py-1.5 shadow-card border border-hairline"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => toggle(emoji)}
              disabled={busy}
              aria-label={`React ${emoji}`}
              className="inline-flex size-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-hairline"
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-press">
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

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
