import { Sdk } from "@aboutcircles/sdk";

import { normalizeAddress } from "@/lib/addr";

export type ProfileCard = {
  address: `0x${string}`;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  previewImageUrl: string | null;
  registered: boolean;
};

const PROFILE_TTL_MS = 5 * 60_000;
type Entry = { fetchedAt: number; data: ProfileCard };
const cache = new Map<`0x${string}`, Entry>();
const inflight = new Map<`0x${string}`, Promise<ProfileCard>>();

let sdkInstance: Sdk | null = null;
function getSdk(): Sdk {
  sdkInstance ??= new Sdk();
  return sdkInstance;
}

function emptyCard(address: `0x${string}`): ProfileCard {
  return {
    address,
    name: null,
    description: null,
    imageUrl: null,
    previewImageUrl: null,
    registered: false,
  };
}

type RawProfile = {
  address?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  previewImageUrl?: string;
} | null;

function rowToCard(address: `0x${string}`, row: RawProfile): ProfileCard {
  if (!row) {
    return emptyCard(address);
  }
  return {
    address,
    name: row.name ?? null,
    description: row.description ?? null,
    imageUrl: row.imageUrl ?? null,
    previewImageUrl: row.previewImageUrl ?? null,
    // The batch endpoint only returns rows for addresses that have an
    // indexed profile, so a non-null row implies a registered avatar.
    registered: true,
  };
}

/**
 * Single-address fetch. Routes through the batch path so we share the cache
 * + inflight de-dupe with `fetchProfileCards`. Kept for ergonomics — most
 * callers should prefer the batched version directly.
 */
export async function fetchProfileCard(
  address: `0x${string}`,
): Promise<ProfileCard> {
  const map = await fetchProfileCards([address]);
  return map.get(address) ?? emptyCard(address);
}

/**
 * Batched profile fetch. Hits `circles_getProfileByAddressBatch` once for
 * everything that isn't already cached. Falls back to the per-address path
 * if the batch call fails.
 */
export async function fetchProfileCards(
  addresses: `0x${string}`[],
): Promise<Map<`0x${string}`, ProfileCard>> {
  const out = new Map<`0x${string}`, ProfileCard>();
  const toFetch: `0x${string}`[] = [];

  // Normalise + cache pass.
  const unique = new Set<`0x${string}`>();
  for (const raw of addresses) {
    const addr = normalizeAddress(raw);
    if (!addr) {
      out.set(raw, emptyCard(raw));
      continue;
    }
    if (unique.has(addr)) continue;
    unique.add(addr);
    const cached = cache.get(addr);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) {
      out.set(addr, cached.data);
      continue;
    }
    const ongoing = inflight.get(addr);
    if (ongoing) {
      out.set(addr, await ongoing);
      continue;
    }
    toFetch.push(addr);
  }

  if (toFetch.length === 0) return out;

  // One round-trip for the whole missing set.
  const batchPromise = (async (): Promise<ProfileCard[]> => {
    try {
      const sdk = getSdk();
      const rows = (await sdk.rpc.profile.getProfileByAddressBatch(
        toFetch,
      )) as RawProfile[];
      return toFetch.map((addr, i) => rowToCard(addr, rows?.[i] ?? null));
    } catch (err) {
      console.warn("[profile] batch fetch failed:", err);
      return toFetch.map((addr) => emptyCard(addr));
    }
  })();

  // Register inflight so concurrent callers reuse the same promise.
  for (const addr of toFetch) {
    inflight.set(
      addr,
      batchPromise.then(
        (cards) => cards.find((c) => c.address === addr) ?? emptyCard(addr),
      ),
    );
  }

  try {
    const cards = await batchPromise;
    for (const card of cards) {
      cache.set(card.address, { fetchedAt: Date.now(), data: card });
      out.set(card.address, card);
    }
  } finally {
    for (const addr of toFetch) inflight.delete(addr);
  }

  return out;
}
