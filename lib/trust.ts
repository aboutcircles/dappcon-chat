import { Sdk } from "@aboutcircles/sdk";

import { normalizeAddress } from "@/lib/addr";

/**
 * Directed BFS over the Circles trust graph.
 *
 * Why we don't use `sdk.rpc.trust.getTrusts(addr)`: the SDK splits the
 * underlying `circles_getAggregatedTrustRelations` response into three
 * disjoint buckets by `relation` — `"trusts"`, `"trustedBy"`, `"mutuallyTrusts"`
 * — and `getTrusts` only returns the **one-sided** ones. Mutual edges are
 * silently dropped. We need both: an outgoing edge exists when A trusts B,
 * whether the trust is mutual or not.
 *
 * Per-address neighbour fetches are cached for NEIGHBOUR_TTL_MS; trust
 * changes are rare during a 2-day event so a long TTL is safe and avoids
 * repeated indexer roundtrips on each poll.
 *
 * BFS expansion is **parallel within each frontier level** — every node at
 * the same depth is fetched concurrently. This turns a 200-neighbour-deep
 * expansion from 200 sequential RPC roundtrips into 1.
 */

const MAX_NODES_PER_CALL = 5000;
const NEIGHBOUR_TTL_MS = 15 * 60_000; // 15 min

type NeighbourEntry = { fetchedAt: number; neighbours: `0x${string}`[] };
const neighbourCache = new Map<`0x${string}`, NeighbourEntry>();
const inflight = new Map<`0x${string}`, Promise<`0x${string}`[]>>();

let sdkInstance: Sdk | null = null;
function getSdk(): Sdk {
  sdkInstance ??= new Sdk();
  return sdkInstance;
}

type AggregatedRelation = {
  subjectAvatar?: string;
  objectAvatar?: string;
  relation?: string;
};

async function fetchOutgoingNeighbours(
  address: `0x${string}`,
): Promise<`0x${string}`[]> {
  const cached = neighbourCache.get(address);
  if (cached && Date.now() - cached.fetchedAt < NEIGHBOUR_TTL_MS) {
    return cached.neighbours;
  }
  const existing = inflight.get(address);
  if (existing) return existing;

  const promise = (async () => {
    const sdk = getSdk();
    const rows = (await sdk.rpc.trust
      .getAggregatedTrustRelations(address)
      .catch(() => [] as AggregatedRelation[])) as AggregatedRelation[];

    const set = new Set<`0x${string}`>();
    for (const r of rows) {
      // Outgoing edges: address trusts other (one-sided OR mutual).
      if (r.relation !== "trusts" && r.relation !== "mutuallyTrusts") continue;
      const other = normalizeAddress(r.objectAvatar);
      if (other && other !== address) set.add(other);
    }
    const neighbours = Array.from(set);
    neighbourCache.set(address, { fetchedAt: Date.now(), neighbours });
    return neighbours;
  })();

  inflight.set(address, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(address);
  }
}

/**
 * Expand a whole BFS frontier in parallel and return the deduped union of
 * (node, neighbour) pairs we discovered. Caller decides what to do with
 * them.
 */
async function expandFrontier(
  frontier: `0x${string}`[],
): Promise<Array<readonly [`0x${string}`, `0x${string}`[]]>> {
  return Promise.all(
    frontier.map(async (node) => {
      const neighbours = await fetchOutgoingNeighbours(node);
      return [node, neighbours] as const;
    }),
  );
}

export async function hopDistance(
  from: `0x${string}`,
  to: `0x${string}`,
  maxHops: number,
): Promise<number | null> {
  if (from === to) return 0;
  if (maxHops <= 0) return null;

  const visited = new Set<`0x${string}`>([from]);
  let frontier: `0x${string}`[] = [from];

  for (let depth = 1; depth <= maxHops; depth++) {
    if (visited.size > MAX_NODES_PER_CALL) return null;
    const expansions = await expandFrontier(frontier);
    const nextFrontier: `0x${string}`[] = [];
    for (const [, neighbours] of expansions) {
      for (const n of neighbours) {
        if (n === to) return depth;
        if (visited.has(n)) continue;
        visited.add(n);
        nextFrontier.push(n);
      }
    }
    if (nextFrontier.length === 0) return null;
    frontier = nextFrontier;
  }

  return null;
}

/**
 * Compute hops from `from` to every address in `candidates`, capped at
 * `maxHops`. Returns a map of address → hop count (omitted if unreachable
 * within the cap). The whole frontier is expanded in parallel per depth.
 */
export async function hopsToMany(
  from: `0x${string}`,
  candidates: `0x${string}`[],
  maxHops: number,
): Promise<Map<`0x${string}`, number>> {
  const out = new Map<`0x${string}`, number>();
  const target = new Set(candidates.filter((c) => c !== from));
  if (target.size === 0) {
    for (const c of candidates) if (c === from) out.set(c, 0);
    return out;
  }
  for (const c of candidates) if (c === from) out.set(c, 0);

  if (maxHops <= 0) return out;

  const visited = new Set<`0x${string}`>([from]);
  let frontier: `0x${string}`[] = [from];

  for (let depth = 1; depth <= maxHops && target.size > 0; depth++) {
    if (visited.size > MAX_NODES_PER_CALL) return out;
    const expansions = await expandFrontier(frontier);
    const nextFrontier: `0x${string}`[] = [];
    for (const [, neighbours] of expansions) {
      for (const n of neighbours) {
        if (visited.has(n)) continue;
        visited.add(n);
        if (target.has(n)) {
          out.set(n, depth);
          target.delete(n);
        }
        nextFrontier.push(n);
      }
      if (target.size === 0) break;
    }
    if (nextFrontier.length === 0) break;
    frontier = nextFrontier;
  }

  return out;
}
