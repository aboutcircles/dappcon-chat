/**
 * Curated tag vocabulary for attendee interests. Kept small so the People
 * filter stays scannable; server-side validation drops anything not in this
 * list. Order matters for the chip rows.
 */
export const TAG_OPTIONS = [
  "AI",
  "payments",
  "defi",
  "privacy",
  "circles",
  "infra",
  "governance",
  "identity",
  "meet others",
] as const;

export type TagOption = (typeof TAG_OPTIONS)[number];

/**
 * Case-insensitive lookup that maps user-supplied strings back to the
 * canonical TAG_OPTIONS value (preserving the casing users expect — e.g.
 * "AI" stays uppercase, "meet others" keeps its space).
 */
const CANONICAL_BY_LOWER = new Map<string, TagOption>(
  TAG_OPTIONS.map((t) => [t.toLowerCase(), t]),
);

export function normalizeTag(value: string): TagOption | null {
  return CANONICAL_BY_LOWER.get(value.trim().toLowerCase()) ?? null;
}

export function isTagOption(value: string): value is TagOption {
  return (TAG_OPTIONS as readonly string[]).includes(value);
}
