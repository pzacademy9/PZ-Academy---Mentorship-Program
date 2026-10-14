import { NextRequest, NextResponse } from "next/server";
import { drainDueJobs } from "@/lib/data/landing-jobs";

// Cron target: must run per request (same reason as /api/keep-alive).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily safety net for the landing_jobs outbox (Hobby plan: crons run at most once a day).
 * Registrations normally run their own jobs via waitUntil; this catches anything that
 * crashed or is waiting on backoff.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await drainDueJobs(25);
  return NextResponse.json({ ok: true, ...result });
}
