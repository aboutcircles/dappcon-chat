import { NextResponse } from "next/server";

import { normalizeAddress } from "@/lib/addr";
import { getServerSession } from "@/lib/session";
import { getAttendee, setAttendeeXmtpInboxId } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Backfill an inbox→address mapping derived by *any* signed-in user via the
 * working address→inbox direction (`fetchInboxIdByIdentifier`). XMTP's
 * inbox→address path fails for Safe-signed peers when their EIP-1271
 * isValidSignature payload exceeds the RPC provider's limit (413), so we
 * crowdsource the mapping instead. Anyone can record any mapping because
 * the underlying data is derived from XMTP's public directory — we're only
 * caching, not asserting trust.
 */
export async function POST(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { address?: unknown; inboxId?: unknown }
    | null;
  const address = normalizeAddress(
    typeof body?.address === "string" ? body.address : null,
  );
  const inboxId =
    body && typeof body.inboxId === "string" ? body.inboxId.trim() : "";
  if (!address || !inboxId) {
    return NextResponse.json(
      { error: "address and inboxId required" },
      { status: 400 },
    );
  }
  // Only record mappings for registered attendees — this is a Dappcon
  // directory, not an open XMTP cache.
  const attendee = await getAttendee(address);
  if (!attendee) {
    return NextResponse.json({ ok: false, reason: "not-registered" });
  }
  await setAttendeeXmtpInboxId(address, inboxId);
  return NextResponse.json({ ok: true });
}
