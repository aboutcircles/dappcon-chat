import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { listAttendees, upsertAttendee } from "@/lib/store";
import { normalizeTag } from "@/lib/tags";
import type { AttendanceMode } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const attendees = await listAttendees();
  return NextResponse.json({ attendees });
}

export async function POST(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const mode = body.mode === "in-person" || body.mode === "online"
    ? (body.mode as AttendanceMode)
    : undefined;
  const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : undefined;
  // Interests are constrained to the curated TAG_OPTIONS list (lib/tags.ts).
  // We accept any casing (e.g. "ai" or "AI") and normalise back to the
  // canonical display value; unknown tags are silently dropped.
  const interests = Array.isArray(body.interests)
    ? Array.from(
        new Set(
          (body.interests as unknown[])
            .filter((x): x is string => typeof x === "string")
            .map(normalizeTag)
            .filter((x): x is NonNullable<typeof x> => x !== null),
        ),
      )
    : undefined;

  if (!mode && bio === undefined && interests === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const attendee = await upsertAttendee(session.address, { mode, bio, interests });
  return NextResponse.json({ attendee });
}
