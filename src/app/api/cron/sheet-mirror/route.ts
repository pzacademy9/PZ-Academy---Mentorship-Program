import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runMirrorForAllPages } from "@/lib/data/landing-mirror";

// Called every 15 minutes by a Supabase pg_cron + pg_net job (the free Vercel plan only allows a daily cron).
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
    const runs = await runMirrorForAllPages();
    return NextResponse.json({
      pages: runs.length,
      // Problems are a count only: row details stay in the admin screen.
      results: runs.map((r) => ({
        pageId: r.pageId, ok: r.result.ok, inserted: r.result.inserted, changed: r.result.changed, problems: r.result.problems.length,
      })),
    });
  } catch {
    console.error("[sheet-mirror] cron run failed");
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
