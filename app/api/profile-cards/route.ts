import { NextResponse } from "next/server";

import { normalizeAddress } from "@/lib/addr";
import { fetchProfileCards } from "@/lib/profile-fetch";

export const runtime = "nodejs";

/**
 * Batch profile lookup for client-side surfaces that already know which
 * addresses they need (XMTP DM peers, in particular). No auth — these are
 * the same Circles-public profiles available elsewhere via the indexer.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    addresses?: unknown;
  } | null;
  const list = Array.isArray(body?.addresses) ? body.addresses : [];
  const cleaned: `0x${string}`[] = [];
  for (const raw of list) {
    const addr = typeof raw === "string" ? normalizeAddress(raw) : null;
    if (addr) cleaned.push(addr);
  }
  if (cleaned.length === 0) return NextResponse.json({ profiles: {} });

  const map = await fetchProfileCards(cleaned);
  const out: Record<string, unknown> = {};
  for (const [addr, card] of map) out[addr.toLowerCase()] = card;
  return NextResponse.json({ profiles: out });
}
