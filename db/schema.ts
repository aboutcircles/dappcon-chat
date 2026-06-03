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

export const attendees = pgTable("attendees", {
  address: text("address").primaryKey(),
  mode: text("mode").notNull(), // "in-person" | "online"
  bio: text("bio").notNull().default(""),
  interests: jsonb("interests").$type<string[]>().notNull().default([]),
  registeredAt: bigint("registered_at", { mode: "number" }).notNull(),
});

export const settings = pgTable("settings", {
  address: text("address").primaryKey(),
  feedHops: integer("feed_hops").notNull(),
  feedFilterOn: boolean("feed_filter_on").notNull(),
  dmHops: integer("dm_hops").notNull(),
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

