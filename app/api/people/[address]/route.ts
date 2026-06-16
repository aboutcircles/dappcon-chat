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
  // The DM gate is set by the *recipient* — their filter decides who is
  // allowed to start a DM with them. We only BFS as far as their cap; anyone
  // farther than that is out of range regardless.
  const distance =
    target === session.address
      ? 0
      : await hopDistance(session.address, target, theirSettings.dmHops);

  const canDm =
    target !== session.address &&
    (!theirSettings.dmFilterOn ||
      (distance !== null && distance <= theirSettings.dmHops));

  return NextResponse.json({
    me: session.address,
    target,
    profile,
    attendee,
    hopsFromMe: distance,
    theirDmHops: theirSettings.dmHops,
    theirDmFilterOn: theirSettings.dmFilterOn,
    myDmHops: mySettings.dmHops,
    myDmFilterOn: mySettings.dmFilterOn,
    canDm,
  });
}
