"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { usePolling } from "@/hooks/use-polling";
import { authedFetch } from "@/lib/api";
import type { ProfileCard } from "@/lib/profile-fetch";
import type { DirectMessage } from "@/lib/types";

type Response = {
  me: `0x${string}`;
  peer: `0x${string}`;
  peerProfile: ProfileCard;
  messages: DirectMessage[];
};

export function DmThread({
  me,
  peerAddress,
}: {
  me: `0x${string}`;
  peerAddress: string;
}) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const res = await authedFetch(me, `/api/dms/${peerAddress}`);
        if (!res.ok) throw new Error("Failed to load");
        const json = (await res.json()) as Response;
        setData(json);
      } catch (err) {
        if (!opts.silent) {
          toast.error(err instanceof Error ? err.message : "Failed to load DMs");
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [me, peerAddress],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Poll the open thread every 5s; pauses when the tab isn't visible.
  usePolling(() => load({ silent: true }), 5_000);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [data?.messages.length]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setGateError(null);
    try {
      const res = await authedFetch(me, `/api/dms/${peerAddress}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (res.status === 403) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setGateError(
          err?.error ?? "Recipient blocks DMs from your hop distance.",
        );
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error ?? `Failed (${res.status})`);
      }
      setDraft("");
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading && !data) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (!data) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href="/dms"
          className="font-mono text-sm text-ink-muted hover:text-ink"
        >
          ← messages
        </Link>
        <Link
          href={`/people/${data.peer}`}
          className="flex items-center gap-2 hover:underline"
        >
          <ProfileAvatar
            src={data.peerProfile.previewImageUrl ?? data.peerProfile.imageUrl}
            name={data.peerProfile.name}
            address={data.peer}
            className="size-8"
          />
          <span className="text-base font-semibold">
            <ProfileName name={data.peerProfile.name} address={data.peer} />
          </span>
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-[20px] bg-surface p-5 shadow-card"
      >
        {data.messages.length === 0 ? (
          <p className="m-auto text-base text-ink-muted">
            No messages yet — say hi.
          </p>
        ) : (
          data.messages.map((m) => (
            <MessageBubble key={m.id} message={m} mine={m.from === me} />
          ))
        )}
      </div>

      {gateError && (
        <p className="rounded-[14px] bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {gateError}
        </p>
      )}

      <div className="flex gap-2 rounded-[20px] bg-surface p-3 shadow-card">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          rows={2}
          maxLength={2000}
          className="resize-none border-none bg-transparent p-2 text-base focus-visible:ring-0 shadow-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          onClick={send}
          disabled={sending || !draft.trim()}
          variant="brand"
          className="self-end"
        >
          Send
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        ⌘/Ctrl+Enter to send. Stored server-side (v0); E2E via XMTP planned.
      </p>
    </>
  );
}

function MessageBubble({
  message,
  mine,
}: {
  message: DirectMessage;
  mine: boolean;
}) {
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-base whitespace-pre-wrap break-words " +
          (mine ? "bg-ink text-surface" : "bg-hairline text-ink")
        }
      >
        {message.content}
        <div
          className={
            "mt-1 text-[11px] font-mono " +
            (mine ? "text-surface/60" : "text-ink-muted")
          }
        >
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
