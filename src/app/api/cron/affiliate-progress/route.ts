import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runProgressEmails } from "@/lib/data/affiliate-progress";

// Called every few minutes by a Supabase pg_cron + pg_net job (the free Vercel plan only allows a daily cron).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: with no CRON_SECRET configured the route is not callable at all.
  const given = req.headers.get("authorization") ?? "";
  if (!cronSecret || !timingSafeEqual(digest(given), digest(`Bearer ${cronSecret}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Counts only: no names, emails or ids leave this route.
    const { affiliates, sent, failed, skipped } = await runProgressEmails();
    return NextResponse.json({ affiliates, sent, failed, skipped });
  } catch {
    console.error("[affiliate-progress] cron run failed");
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
