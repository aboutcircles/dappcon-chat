import { NextResponse } from "next/server";

import { wipeAllData } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Scheduled post-event wipe. Vercel Cron calls this from the schedule defined
 * in vercel.json. The hard cutoff is on 2026-06-19 — 48h after DappCon ends.
 * Until then the route is a no-op so we can't accidentally clear data while
 * editing the cron expression.
 *
 * Authorisation: in production Vercel sets `Authorization: Bearer
 * $CRON_SECRET` on its cron calls when the env var is configured.
 */
const WIPE_NOT_BEFORE = Date.UTC(2026, 5, 19, 0, 0, 0); // 2026-06-19 00:00 UTC

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  if (Date.now() < WIPE_NOT_BEFORE) {
    return NextResponse.json({
      ok: true,
      wiped: false,
      reason: "before wipe date",
      wipeAt: new Date(WIPE_NOT_BEFORE).toISOString(),
    });
  }
  await wipeAllData();
  return NextResponse.json({ ok: true, wiped: true, at: Date.now() });
}
