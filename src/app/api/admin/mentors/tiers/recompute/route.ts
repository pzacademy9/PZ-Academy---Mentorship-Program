import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { recomputeAllMentorTiers } from "@/lib/data/mentor-tiers";

/** Recomputes tier_computed/tier_score/counters for every mentor. No body — nothing to validate. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { updated } = await recomputeAllMentorTiers();
  return NextResponse.json({ ok: true, updated });
}
