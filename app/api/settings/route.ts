import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import { getSettings, updateSettings } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const settings = await getSettings(session.address);
  return NextResponse.json({ settings });
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
  const settings = await updateSettings(session.address, {
    feedHops: typeof body.feedHops === "number" ? body.feedHops : undefined,
    feedFilterOn:
      typeof body.feedFilterOn === "boolean" ? body.feedFilterOn : undefined,
    dmHops: typeof body.dmHops === "number" ? body.dmHops : undefined,
  });
  return NextResponse.json({ settings });
}
