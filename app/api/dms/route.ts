import { NextResponse } from "next/server";

import { fetchProfileCards } from "@/lib/profile-fetch";
import { getServerSession } from "@/lib/session";
import { listConversations } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const conversations = await listConversations(session.address);
  const profiles = await fetchProfileCards(conversations.map((c) => c.peer));
  return NextResponse.json({
    conversations: conversations.map((c) => ({
      peer: c.peer,
      lastMessage: c.last,
      profile: profiles.get(c.peer) ?? null,
    })),
  });
}
