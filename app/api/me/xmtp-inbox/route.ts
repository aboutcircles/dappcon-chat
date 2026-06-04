import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { getAttendee, setAttendeeXmtpInboxId } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Record the authenticated attendee's XMTP inbox ID. Called by the XMTP
 * provider whenever the client attaches successfully (idempotent), so we
 * can reverse peer inbox IDs back to Circles addresses without relying on
 * the XMTP preferences API surfacing an Ethereum identifier.
 */
export async function POST(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { inboxId?: unknown }
    | null;
  const inboxId =
    body && typeof body.inboxId === "string" ? body.inboxId.trim() : "";
  if (!inboxId) {
    return NextResponse.json({ error: "Missing inboxId" }, { status: 400 });
  }
  // Skip if the attendee row doesn't exist yet — registration happens
  // before XMTP enable, so this should never miss in practice, but we
  // shouldn't 500 if the user hits the API mid-onboarding.
  const attendee = await getAttendee(session.address);
  if (!attendee) {
    return NextResponse.json(
      { error: "Register first" },
      { status: 404 },
    );
  }
  await setAttendeeXmtpInboxId(session.address, inboxId);
  return NextResponse.json({ ok: true });
}
