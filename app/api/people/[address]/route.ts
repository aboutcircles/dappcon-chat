import { NextResponse } from "next/server";

import { normalizeAddress } from "@/lib/addr";
import { fetchProfileCard } from "@/lib/profile-fetch";
import { getServerSession } from "@/lib/session";
import { getAttendee, getSettings } from "@/lib/store";
import { hopDistance } from "@/lib/trust";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ address: string }> },
) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { address: raw } = await ctx.params;
  const target = normalizeAddress(raw);
  if (!target) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const [profile, attendee, mySettings, theirSettings] = await Promise.all([
    fetchProfileCard(target),
    getAttendee(target),
    getSettings(session.address),
    getSettings(target),
  ]);
  // The DM gate is set by the *recipient*; check distance up to that cap.
  const dmCap = Math.max(theirSettings.dmHops, mySettings.dmHops);
  const distance =
    target === session.address
      ? 0
      : await hopDistance(session.address, target, dmCap);

  const canDm =
    target !== session.address &&
    distance !== null &&
    distance <= theirSettings.dmHops;

  return NextResponse.json({
    me: session.address,
    target,
    profile,
    attendee,
    hopsFromMe: distance,
    theirDmHops: theirSettings.dmHops,
    myDmHops: mySettings.dmHops,
    canDm,
  });
}
