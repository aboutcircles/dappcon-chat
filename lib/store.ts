import "server-only";

import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { normalizeAddress } from "@/lib/addr";
import { DEFAULT_HOPS, MAX_HOPS } from "@/lib/constants";
import type {
  AttendanceMode,
  Attendee,
  Post,
  Reaction,
  Settings,
} from "@/lib/types";
import { REACTION_EMOJIS } from "@/lib/types";

export type { AttendanceMode, Attendee, Post, Reaction, Settings };

function clampHops(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_HOPS, Math.max(1, Math.round(n)));
}

function defaultSettings(address: `0x${string}`): Settings {
  return {
    address,
    feedHops: DEFAULT_HOPS,
    feedFilterOn: true,
    dmHops: DEFAULT_HOPS,
  };
}

function randomId(): string {
  return (
    Date.now().toString(36) + randomBytes(5).toString("hex")
  ).slice(0, 18);
}

/* ---------- Attendees ---------- */

export async function getAttendee(
  address: `0x${string}`,
): Promise<Attendee | null> {
  const rows = await db()
    .select()
    .from(schema.attendees)
    .where(eq(schema.attendees.address, address))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return rowToAttendee(row);
}

export async function listAttendees(): Promise<Attendee[]> {
  const rows = await db()
    .select()
    .from(schema.attendees)
    .orderBy(desc(schema.attendees.registeredAt));
  return rows.map(rowToAttendee);
}

export async function upsertAttendee(
  address: `0x${string}`,
  patch: { mode?: AttendanceMode; bio?: string; interests?: string[] },
): Promise<Attendee> {
  const existing = await getAttendee(address);
  const next: Attendee = {
    address,
    mode: patch.mode ?? existing?.mode ?? "in-person",
    bio: patch.bio ?? existing?.bio ?? "",
    interests: patch.interests ?? existing?.interests ?? [],
    registeredAt: existing?.registeredAt ?? Date.now(),
  };
  await db()
    .insert(schema.attendees)
    .values({
      address: next.address,
      mode: next.mode,
      bio: next.bio,
      interests: next.interests,
      registeredAt: next.registeredAt,
    })
    .onConflictDoUpdate({
      target: schema.attendees.address,
      set: {
        mode: next.mode,
        bio: next.bio,
        interests: next.interests,
      },
    });
  return next;
}

function rowToAttendee(row: typeof schema.attendees.$inferSelect): Attendee {
  return {
    address: row.address as `0x${string}`,
    mode: row.mode as AttendanceMode,
    bio: row.bio,
    interests: row.interests,
    registeredAt: row.registeredAt,
  };
}

/* ---------- Settings ---------- */

export async function getSettings(
  address: `0x${string}`,
): Promise<Settings> {
  const rows = await db()
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.address, address))
    .limit(1);
  const row = rows[0];
  if (!row) return defaultSettings(address);
  return {
    address: row.address as `0x${string}`,
    feedHops: row.feedHops,
    feedFilterOn: row.feedFilterOn,
    dmHops: row.dmHops,
  };
}

export async function updateSettings(
  address: `0x${string}`,
  patch: { feedHops?: number; feedFilterOn?: boolean; dmHops?: number },
): Promise<Settings> {
  const existing = await getSettings(address);
  const next: Settings = {
    address,
    feedHops: clampHops(patch.feedHops, existing.feedHops),
    feedFilterOn:
      typeof patch.feedFilterOn === "boolean"
        ? patch.feedFilterOn
        : existing.feedFilterOn,
    dmHops: clampHops(patch.dmHops, existing.dmHops),
  };
  await db()
    .insert(schema.settings)
    .values(next)
    .onConflictDoUpdate({
      target: schema.settings.address,
      set: {
        feedHops: next.feedHops,
        feedFilterOn: next.feedFilterOn,
        dmHops: next.dmHops,
      },
    });
  return next;
}

/* ---------- Posts ---------- */

export async function listPosts(limit = 100): Promise<Post[]> {
  const rows = await db()
    .select()
    .from(schema.posts)
    .where(isNull(schema.posts.parentId))
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit);
  return rows.map(rowToPost);
}

export async function listRepliesByParent(
  parentIds: string[],
): Promise<Map<string, Post[]>> {
  const out = new Map<string, Post[]>();
  for (const id of parentIds) out.set(id, []);
  if (parentIds.length === 0) return out;
  const rows = await db()
    .select()
    .from(schema.posts)
    .where(inArray(schema.posts.parentId, parentIds))
    .orderBy(asc(schema.posts.createdAt));
  for (const r of rows) {
    const key = r.parentId!;
    out.get(key)?.push(rowToPost(r));
  }
  return out;
}

export async function getPost(id: string): Promise<Post | null> {
  const rows = await db()
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, id))
    .limit(1);
  return rows[0] ? rowToPost(rows[0]) : null;
}

export async function createPost(
  author: `0x${string}`,
  content: string,
  parentId: string | null = null,
): Promise<Post> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Empty post");
  if (trimmed.length > 200) throw new Error("Post too long");
  if (parentId) {
    const parent = await getPost(parentId);
    if (!parent) throw new Error("Parent post not found");
    if (parent.parentId) throw new Error("Replies cannot be nested");
  }
  const post: Post = {
    id: randomId(),
    author,
    content: trimmed,
    createdAt: Date.now(),
    parentId,
  };
  await db().insert(schema.posts).values(post);
  return post;
}

function rowToPost(row: typeof schema.posts.$inferSelect): Post {
  return {
    id: row.id,
    author: row.author as `0x${string}`,
    content: row.content,
    createdAt: row.createdAt,
    parentId: row.parentId,
  };
}

/* ---------- Reactions ---------- */

export async function toggleReaction(
  postId: string,
  author: `0x${string}`,
  emoji: string,
): Promise<Reaction[]> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    throw new Error("Unsupported emoji");
  }
  const post = await getPost(postId);
  if (!post) throw new Error("Post not found");
  const existing = await db()
    .select()
    .from(schema.reactions)
    .where(
      and(
        eq(schema.reactions.postId, postId),
        eq(schema.reactions.author, author),
        eq(schema.reactions.emoji, emoji),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db()
      .delete(schema.reactions)
      .where(eq(schema.reactions.id, existing[0].id));
  } else {
    await db().insert(schema.reactions).values({
      id: randomId(),
      postId,
      author,
      emoji,
      createdAt: Date.now(),
    });
  }
  const rows = await db()
    .select()
    .from(schema.reactions)
    .where(eq(schema.reactions.postId, postId));
  return rows.map(rowToReaction);
}

export async function listReactionsForPosts(
  postIds: string[],
): Promise<Map<string, Reaction[]>> {
  const out = new Map<string, Reaction[]>();
  for (const id of postIds) out.set(id, []);
  if (postIds.length === 0) return out;
  const rows = await db()
    .select()
    .from(schema.reactions)
    .where(inArray(schema.reactions.postId, postIds));
  for (const r of rows) out.get(r.postId)?.push(rowToReaction(r));
  return out;
}

function rowToReaction(row: typeof schema.reactions.$inferSelect): Reaction {
  return {
    id: row.id,
    postId: row.postId,
    author: row.author as `0x${string}`,
    emoji: row.emoji,
    createdAt: row.createdAt,
  };
}

/* ---------- Privacy: per-user delete + global wipe ----------
 *
 * Note: DM storage is intentionally absent from this layer — direct
 * messages live on XMTP (end-to-end encrypted, off-platform) and never
 * touch our database.
 */

/**
 * Delete every row this address owns from our server-side store: attendee
 * record, settings, posts (and any replies that pointed at the deleted
 * posts), and reactions they cast or that targeted their posts.
 *
 * Does NOT touch DMs — those live on XMTP, off-platform. The Settings UI
 * exposes a separate "Reset XMTP state" button that clears the local DM
 * cache.
 */
export async function deleteUserData(address: `0x${string}`): Promise<void> {
  // Capture their posts first so we can cascade-delete reactions on them.
  const myPosts = await db()
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(eq(schema.posts.author, address));
  const myPostIds = myPosts.map((p) => p.id);

  // Reactions: theirs (any post) + every reaction targeting their posts.
  await db()
    .delete(schema.reactions)
    .where(eq(schema.reactions.author, address));
  if (myPostIds.length > 0) {
    await db()
      .delete(schema.reactions)
      .where(inArray(schema.reactions.postId, myPostIds));
  }
  // Replies pointing at their top-level posts get dropped too.
  if (myPostIds.length > 0) {
    await db()
      .delete(schema.posts)
      .where(inArray(schema.posts.parentId, myPostIds));
  }
  // Then their own posts.
  await db().delete(schema.posts).where(eq(schema.posts.author, address));

  // Settings + attendee row.
  await db()
    .delete(schema.settings)
    .where(eq(schema.settings.address, address));
  await db()
    .delete(schema.attendees)
    .where(eq(schema.attendees.address, address));
}

export async function wipeAllData(): Promise<void> {
  // Truncate every table. Order doesn't matter (no FKs), but be explicit.
  await db().execute(
    sql`TRUNCATE TABLE reactions, posts, settings, attendees RESTART IDENTITY`,
  );
}

export { normalizeAddress };
