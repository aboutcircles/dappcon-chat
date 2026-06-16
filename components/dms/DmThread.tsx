"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { EnableDmsCard } from "@/components/dms/EnableDmsCard";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileName } from "@/components/profile/ProfileName";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useXmtp } from "@/components/xmtp/XmtpProvider";
import { authedFetch } from "@/lib/api";
import type { Dm } from "@xmtp/browser-sdk";
import { fetchProfileCard, type ProfileCard } from "@/lib/profile-fetch";
import { usePolling } from "@/hooks/use-polling";
import {
  isTextMessage,
  loadThreadMessages,
  markConversationRescued,
  openOrCreateDm,
  sendText,
  streamThread,
  syncConv,
  type ThreadMessage,
} from "@/lib/xmtp/dms";

export function DmThread({
  me,
  peerAddress,
}: {
  me: `0x${string}`;
  peerAddress: string;
}) {
  const { status } = useXmtp();

  // Mirror the wrapper page contract — let the user see what's behind the
  // signature wall before they commit to signing.
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
    <XmtpThread me={me} peerAddress={peerAddress} myInboxId={status.inboxId} />
  );
}

type PeerGate = {
  hopsFromMe: number | null;
  theirDmHops: number;
  theirDmFilterOn: boolean;
  canDm: boolean;
};

function XmtpThread({
  me,
  peerAddress,
  myInboxId,
}: {
  me: `0x${string}`;
  peerAddress: string;
  myInboxId: string;
}) {
  const { status } = useXmtp();
  const [conv, setConv] = useState<Dm | null>(null);
  const [convError, setConvError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [peerProfile, setPeerProfile] = useState<ProfileCard | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [peerGate, setPeerGate] = useState<PeerGate | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRanForRef = useRef<string | null>(null);

  // Fetch the peer Circles profile in parallel with everything else.
  useEffect(() => {
    void fetchProfileCard(peerAddress as `0x${string}`).then(setPeerProfile);
  }, [peerAddress]);

  // Pull the peer's DM gate — their filter decides whether I'm allowed to
  // initiate. The API already returns canDm with filter-off accounted for.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(me, `/api/people/${peerAddress}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as PeerGate;
        if (!cancelled) setPeerGate(json);
      } catch {
        /* network failure — leave peerGate null; we'll fall back to "allow" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, peerAddress]);

  // Open or create the DM. We split this from the streaming effect so we
  // don't have to re-open the conv on every re-render.
  useEffect(() => {
    if (status.kind !== "ready") return;
    const key = `${status.inboxId}:${peerAddress.toLowerCase()}`;
    if (initRanForRef.current === key) return;
    initRanForRef.current = key;

    let cancelled = false;
    setLoading(true);
    setConvError(null);

    (async () => {
      try {
        const dm = await openOrCreateDm(
          status.client,
          peerAddress as `0x${string}`,
        );
        if (cancelled) return;
        if (!dm) {
          setConvError(
            "This wallet has never used XMTP — they need to enable DMs in any XMTP-compatible app first.",
          );
          setLoading(false);
          return;
        }
        setConv(dm);
        const history = await loadThreadMessages(dm, myInboxId);
        if (cancelled) return;
        setMessages(history);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to open DM";
        setConvError(msg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, peerAddress, myInboxId]);

  // Streaming + scroll-to-bottom.
  useEffect(() => {
    if (!conv) return;
    let cleanup: (() => void) | null = null;
    (async () => {
      cleanup = await streamThread(conv, (msg) => {
        if (!isTextMessage(msg)) return;
        const text = typeof msg.content === "string" ? msg.content : "";
        const entry: ThreadMessage = {
          id: msg.id,
          text,
          sentAtNs: msg.sentAtNs ?? 0n,
          senderInboxId: msg.senderInboxId,
          mine: msg.senderInboxId === myInboxId,
        };
        setMessages((prev) => {
          if (prev.some((p) => p.id === entry.id)) return prev;
          return [...prev, entry].sort((a, b) =>
            a.sentAtNs < b.sentAtNs ? -1 : 1,
          );
        });
      });
    })();
    return () => {
      cleanup?.();
    };
  }, [conv, myInboxId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Block first-time initiation when the peer's own gate says no. Once a
  // conversation already exists, both directions stay open regardless.
  const blockedAtInit = !conv && peerGate !== null && !peerGate.canDm;

  const canSend = useMemo(() => !!conv && !sending && !!draft.trim(), [
    conv,
    sending,
    draft,
  ]);

  async function send() {
    if (!conv) return;
    if (!draft.trim()) return;
    setSending(true);
    try {
      await sendText(conv, draft.trim());
      // Once I reply, the convo escapes the inbox filter permanently for
      // this device — even if the peer is "outside" my current dmHops.
      markConversationRescued(myInboxId, conv.id);
      setDraft("");
      // Re-load from local state — sendText syncs the conversation, so this
      // pulls the just-sent message into our messages list immediately
      // without waiting for the stream callback.
      const fresh = await loadThreadMessages(conv, myInboxId);
      setMessages(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  // Periodic sync as a safety net — if the per-conversation stream misses
  // a message (network flake, browser throttle), this catches it within
  // ~10 s. Cheap because XMTP sync is local + incremental.
  usePolling(async () => {
    if (!conv) return;
    try {
      await syncConv(conv);
      const fresh = await loadThreadMessages(conv, myInboxId);
      setMessages(fresh);
    } catch {
      /* non-fatal */
    }
  }, 10_000);

  if (loading) {
    return (
      <>
        <Link
          href="/dms"
          className="font-mono text-sm text-ink-muted hover:text-ink"
        >
          ← messages
        </Link>
        <Skeleton className="h-96 w-full rounded-[20px]" />
      </>
    );
  }

  if (convError) {
    return (
      <>
        <Link
          href="/dms"
          className="font-mono text-sm text-ink-muted hover:text-ink"
        >
          ← messages
        </Link>
        <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-2">
          <p className="text-sm font-semibold">Can&apos;t open this DM</p>
          <p className="text-sm text-ink-muted">{convError}</p>
        </div>
      </>
    );
  }

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
          href={`/people/${peerAddress}`}
          className="flex items-center gap-2 hover:underline"
        >
          <ProfileAvatar
            src={peerProfile?.previewImageUrl ?? peerProfile?.imageUrl}
            name={peerProfile?.name}
            address={peerAddress}
            className="size-8"
          />
          <span className="text-base font-semibold">
            <ProfileName name={peerProfile?.name} address={peerAddress} />
          </span>
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-[20px] bg-surface p-5 shadow-card"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-base text-ink-muted">
            No messages yet — say hi.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {blockedAtInit && peerGate ? (
        <div className="rounded-[20px] bg-surface p-5 shadow-card space-y-2">
          <p className="text-sm font-semibold">
            They aren&apos;t accepting DMs from here
          </p>
          <p className="text-sm text-ink-muted">
            They only accept DMs from people within {peerGate.theirDmHops} hop
            {peerGate.theirDmHops === 1 ? "" : "s"} of them on Circles
            {peerGate.hopsFromMe == null
              ? ""
              : ` — you're ${peerGate.hopsFromMe} away`}
            . Try posting on the wall to get on their radar.
          </p>
        </div>
      ) : (
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
            disabled={!canSend}
            variant="brand"
            className="self-end"
          >
            Send
          </Button>
        </div>
      )}

      <p className="text-xs text-ink-muted">
        ⌘/Ctrl+Enter to send. Messages are end-to-end encrypted via XMTP — the
        Dappcon Chat server never sees them.
      </p>
    </>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  return (
    <div className={message.mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-base whitespace-pre-wrap break-words " +
          (message.mine ? "bg-ink text-surface" : "bg-hairline text-ink")
        }
      >
        {message.text}
        <div
          className={
            "mt-1 text-[11px] font-mono " +
            (message.mine ? "text-surface/60" : "text-ink-muted")
          }
        >
          {new Date(Number(message.sentAtNs / 1_000_000n)).toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" },
          )}
        </div>
      </div>
    </div>
  );
}
