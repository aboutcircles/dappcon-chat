import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { getAttendeeAddressByXmtpInboxId } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Reverse-lookup an XMTP inbox ID to the Dappcon attendee's wallet address.
 * Authed because the mapping is intentionally not public — anyone signed in
 * to the app can resolve, but we don't want it to be a generic XMTP
 * directory.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ inboxId: string }> },
) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { inboxId } = await ctx.params;
  if (!inboxId) {
    return NextResponse.json({ error: "Missing inboxId" }, { status: 400 });
  }
  const address = await getAttendeeAddressByXmtpInboxId(inboxId);
  return NextResponse.json({ address });
}
