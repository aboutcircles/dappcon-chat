import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { toggleReaction } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ postId: string }> },
) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { postId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { emoji?: string } | null;
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!emoji) {
    return NextResponse.json({ error: "Missing emoji" }, { status: 400 });
  }
  try {
    const reactions = await toggleReaction(postId, session.address, emoji);
    return NextResponse.json({ reactions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
