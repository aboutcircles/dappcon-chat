import { NextResponse } from "next/server";

import { fetchProfileCards } from "@/lib/profile-fetch";
import { getServerSession } from "@/lib/session";
import {
  createPost,
  getAttendee,
  getSettings,
  listAttendees,
  listPosts,
  listReactionsForPosts,
  listRepliesByParent,
} from "@/lib/store";
import { hopsToMany } from "@/lib/trust";
import type { AttendanceMode, Reaction } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter") === "off" ? "off" : "on";
  const settings = await getSettings(session.address);
  const tops = await listPosts(200);

  // Filter top-level posts first; replies inherit OP visibility.
  const distinctTopAuthors = Array.from(new Set(tops.map((p) => p.author)));
  const hops = filterParam === "on"
    ? await hopsToMany(session.address, distinctTopAuthors, settings.feedHops)
    : new Map<`0x${string}`, number>();

  const visibleTops = filterParam === "on"
    ? tops.filter((p) => p.author === session.address || hops.has(p.author))
    : tops;

  const visibleIds = visibleTops.map((p) => p.id);
  const repliesByParent = await listRepliesByParent(visibleIds);

  // Collect every author (top + reply) for profile + mode lookup.
  const allAuthors = new Set<`0x${string}`>(distinctTopAuthors);
  for (const arr of repliesByParent.values()) {
    for (const r of arr) allAuthors.add(r.author);
  }

  const [profiles, attendees, reactionsByPost] = await Promise.all([
    fetchProfileCards(Array.from(allAuthors)),
    listAttendees(),
    listReactionsForPosts([
      ...visibleIds,
      ...Array.from(repliesByParent.values()).flatMap((r) => r.map((x) => x.id)),
    ]),
  ]);
  const modeByAuthor = new Map<`0x${string}`, AttendanceMode>();
  for (const a of attendees) modeByAuthor.set(a.address, a.mode);
  if (!modeByAuthor.has(session.address)) {
    const me = await getAttendee(session.address);
    if (me) modeByAuthor.set(session.address, me.mode);
  }

  function summarizeReactions(reactions: Reaction[]) {
    const byEmoji = new Map<
      string,
      { emoji: string; count: number; mine: boolean }
    >();
    for (const r of reactions) {
      const entry = byEmoji.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        mine: false,
      };
      entry.count += 1;
      if (r.author === session!.address) entry.mine = true;
      byEmoji.set(r.emoji, entry);
    }
    return Array.from(byEmoji.values());
  }

  function postShape(
    p: { id: string; author: `0x${string}`; content: string; createdAt: number },
    distance: number | null,
  ) {
    return {
      id: p.id,
      author: p.author,
      content: p.content,
      createdAt: p.createdAt,
      hopsFromMe: distance,
      profile: profiles.get(p.author) ?? null,
      mode: modeByAuthor.get(p.author) ?? null,
      reactions: summarizeReactions(reactionsByPost.get(p.id) ?? []),
    };
  }

  return NextResponse.json({
    feedHops: settings.feedHops,
    filter: filterParam,
    posts: visibleTops.map((p) => {
      const distance = p.author === session.address ? 0 : hops.get(p.author) ?? null;
      const replies = (repliesByParent.get(p.id) ?? []).map((r) =>
        postShape(r, null),
      );
      return {
        ...postShape(p, distance),
        replyCount: replies.length,
        replies,
      };
    }),
    totalUnfiltered: tops.length,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const content = typeof body?.content === "string" ? body.content : "";
  const parentId =
    typeof body?.parentId === "string" && body.parentId.length > 0
      ? body.parentId
      : null;
  try {
    const post = await createPost(session.address, content, parentId);
    return NextResponse.json({ post });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to post" },
      { status: 400 },
    );
  }
}
