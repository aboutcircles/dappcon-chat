import { NextResponse } from "next/server";

import { fetchProfileCards } from "@/lib/profile-fetch";
import { getServerSession } from "@/lib/session";
import { getSettings, listAttendees } from "@/lib/store";
import { hopsToMany } from "@/lib/trust";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const settings = await getSettings(session.address);
  const attendees = await listAttendees();
  const addresses = attendees.map((a) => a.address);
  // Cap hop walk at the larger of feedHops and dmHops so the badge can show
  // whether each person is reachable for either gate.
  const cap = Math.max(settings.feedHops, settings.dmHops);
  const [profiles, hops] = await Promise.all([
    fetchProfileCards(addresses),
    hopsToMany(session.address, addresses, cap),
  ]);
  return NextResponse.json({
    feedHops: settings.feedHops,
    dmHops: settings.dmHops,
    attendees: attendees.map((a) => ({
      ...a,
      hopsFromMe:
        a.address === session.address ? 0 : (hops.get(a.address) ?? null),
      profile: profiles.get(a.address) ?? null,
    })),
  });
}
