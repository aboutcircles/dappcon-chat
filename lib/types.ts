export type AttendanceMode = "in-person" | "online";

export type Attendee = {
  address: `0x${string}`;
  mode: AttendanceMode;
  bio: string;
  interests: string[];
  registeredAt: number;
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

export type DirectMessage = {
  id: string;
  from: `0x${string}`;
  to: `0x${string}`;
  content: string;
  createdAt: number;
};
