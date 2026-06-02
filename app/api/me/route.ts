import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { deleteUserData, getAttendee, getSettings } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ session: null });
  }
  const [attendee, settings] = await Promise.all([
    getAttendee(session.address),
    getSettings(session.address),
  ]);
  return NextResponse.json({
    session: { address: session.address },
    attendee,
    settings,
  });
}

/**
 * Delete every row the caller owns: attendee, settings, posts, replies that
 * target their posts, reactions they cast (and reactions on their posts), and
 * DMs they sent or received.
 */
export async function DELETE(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  await deleteUserData(session.address);
  return NextResponse.json({ ok: true });
}
