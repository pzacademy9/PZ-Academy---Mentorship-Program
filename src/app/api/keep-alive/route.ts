import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Cron target: must run per request. Without this Next prerenders the GET at build time (no header read when
// CRON_SECRET is unset), which needs Supabase env vars during the build and would bake the result into the output.
export const dynamic = "force-dynamic";

/**
 * Vercel Cron target — a trivial read keeps the free-tier Supabase project
 * from auto-pausing after ~7 days of total inactivity. Reads `agents`
 * (tiny, always exists after migration 0058) with head:true so it costs
 * nothing beyond touching the database, standing in for a raw `select 1`
 * that supabase-js has no direct escape hatch for without an RPC function.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("agents").select("id", { count: "exact", head: true }).limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
