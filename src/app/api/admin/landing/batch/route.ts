import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { finishBatch, getBatchOverview } from "@/lib/data/landing-batch";
import { batchOverviewQuerySchema, finishBatchBodySchema } from "@/lib/validations/landing-batch";

export const maxDuration = 60;

const failed = () => NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });

/** Mark a module (or the whole course) finished and open it for Paid Live buyers (admin). middleware does not cover /api, so gate here. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = finishBatchBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await finishBatch({ ...parsed.data, adminId: auth.user.id }));
  } catch {
    console.error("[landing-batch] finish batch failed");
    return failed();
  }
}

/** Per-module batch status for the admin screen (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = batchOverviewQuerySchema.safeParse({ pageId: new URL(req.url).searchParams.get("pageId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await getBatchOverview(parsed.data.pageId));
  } catch {
    console.error("[landing-batch] overview failed");
    return failed();
  }
}
