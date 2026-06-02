import { NextResponse } from "next/server";

import { normalizeAddress } from "@/lib/addr";
import { fetchProfileCard } from "@/lib/profile-fetch";
import { getServerSession } from "@/lib/session";
import {
  getSettings,
  listDirectMessages,
  sendDirectMessage,
} from "@/lib/store";
import { hopDistance } from "@/lib/trust";

export const runtime = "nodejs";

async function gateForDm(
  me: `0x${string}`,
  peer: `0x${string}`,
): Promise<{ ok: true } | { ok: false; reason: string; hops: number | null; theirDmHops: number }> {
  if (me === peer) return { ok: false, reason: "Cannot DM yourself", hops: 0, theirDmHops: 0 };
  const theirSettings = await getSettings(peer);
  const hops = await hopDistance(me, peer, theirSettings.dmHops);
  if (hops === null || hops > theirSettings.dmHops) {
    return {
      ok: false,
      reason: `Recipient only accepts DMs from within ${theirSettings.dmHops} hop${theirSettings.dmHops === 1 ? "" : "s"}.`,
      hops,
      theirDmHops: theirSettings.dmHops,
    };
  }
  return { ok: true };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { address: raw } = await ctx.params;
  const peer = normalizeAddress(raw);
  if (!peer) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const messages = await listDirectMessages(session.address, peer);
  const peerProfile = await fetchProfileCard(peer);
  // Allow READING even if the gate has closed since — preserves chat history.
  // Block only on POST.
  return NextResponse.json({
    me: session.address,
    peer,
    peerProfile,
    messages,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { address: raw } = await ctx.params;
  const peer = normalizeAddress(raw);
  if (!peer) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const gate = await gateForDm(session.address, peer);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: gate.reason,
        hops: gate.hops,
        theirDmHops: gate.theirDmHops,
      },
      { status: 403 },
    );
  }
  try {
    const message = await sendDirectMessage(session.address, peer, content);
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send" },
      { status: 400 },
    );
  }
}
