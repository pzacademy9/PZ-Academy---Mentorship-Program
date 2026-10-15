import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { drainDueJobs, makeWaitingJobsDue, retryFailedJobs } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";

export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  // Part 0 L2: a malformed id is "not found" after the auth gate, before any query.
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    const requeued = await retryFailedJobs(id);
    // Waiting jobs sit on a backoff timer and only the daily cron would pick them up, so make them due now too.
    await makeWaitingJobsDue(id);
    runInBackground(drainDueJobs(25));
    return NextResponse.json({ requeued });
  } catch {
    return NextResponse.json({ error: "Could not retry the waiting jobs." }, { status: 500 });
  }
}
