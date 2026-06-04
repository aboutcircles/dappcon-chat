export type AttendanceMode = "in-person" | "online";

export type Attendee = {
  address: `0x${string}`;
  mode: AttendanceMode;
  bio: string;
  interests: string[];
  registeredAt: number;
  /**
   * The attendee's XMTP inbox ID, recorded the first time their browser
   * attached to XMTP after this column was added. Null for attendees who
   * registered before the column existed and haven't reopened the app
   * since, and for attendees who haven't enabled XMTP yet.
   */
  xmtpInboxId: string | null;
};

export type Settings = {
  address: `0x${string}`;
  feedHops: number;
  /**
   * Whether the wall feed filter is on. When false the wall shows every post
   * regardless of trust-graph distance — the "All" position of the slider.
   */
  feedFilterOn: boolean;
  dmHops: number;
  /**
   * Whether the DM initiation filter is on. When false you can start a
   * conversation with anyone regardless of trust-graph distance — the "All"
   * position of the DM slider.
   */
  dmFilterOn: boolean;
};

export type Post = {
  id: string;
  author: `0x${string}`;
  content: string;
  createdAt: number;
  /** Top-level posts have `null`; replies point at their OP's id. */
  parentId: string | null;
};

export type Reaction = {
  id: string;
  postId: string;
  author: `0x${string}`;
  emoji: string;
  createdAt: number;
};

/**
 * Fixed reaction palette — keeping the universe tiny lets us render
 * counts inline without an emoji picker and dodges Unicode/keyboard issues
 * across host environments.
 */
export const REACTION_EMOJIS = ["👍", "👎", "❤️", "💯", "🤔", "🚀"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
