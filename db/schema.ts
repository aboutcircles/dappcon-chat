import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

/**
 * Address columns store the EVM checksummed string verbatim. We don't normalize
 * in SQL — `lib/addr.normalizeAddress` runs at every API boundary.
 */

export const attendees = pgTable(
  "attendees",
  {
    address: text("address").primaryKey(),
    mode: text("mode").notNull(), // "in-person" | "online"
    bio: text("bio").notNull().default(""),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    registeredAt: bigint("registered_at", { mode: "number" }).notNull(),
    /**
     * The attendee's XMTP inbox ID, captured the first time their browser
     * successfully attaches via the XMTP provider. Lets us reverse a peer
     * inbox ID back to a Circles address without depending on XMTP's
     * preferences API, which doesn't always surface Ethereum identifiers
     * for inboxes that were registered elsewhere first.
     */
    xmtpInboxId: text("xmtp_inbox_id"),
  },
  (t) => ({
    byXmtpInboxId: index("attendees_xmtp_inbox_id_idx").on(t.xmtpInboxId),
  }),
);

export const settings = pgTable("settings", {
  address: text("address").primaryKey(),
  feedHops: integer("feed_hops").notNull(),
  feedFilterOn: boolean("feed_filter_on").notNull(),
  dmHops: integer("dm_hops").notNull(),
  // Defaults to true via SQL so existing rows + backfills keep the
  // pre-change behaviour ("filter on" = enforce hop limit).
  dmFilterOn: boolean("dm_filter_on").notNull().default(true),
});

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    author: text("author").notNull(),
    content: text("content").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    /** null for top-level posts; otherwise the OP id (one-level deep). */
    parentId: text("parent_id"),
  },
  (t) => ({
    byCreatedAt: index("posts_created_at_idx").on(t.createdAt),
    byParent: index("posts_parent_id_idx").on(t.parentId),
  }),
);

export const reactions = pgTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull(),
    author: text("author").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    byPost: index("reactions_post_id_idx").on(t.postId),
  }),
);

