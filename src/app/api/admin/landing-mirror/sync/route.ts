import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runMirror, MIRROR_NO_SHEET, MIRROR_PAGE_NOT_FOUND } from "@/lib/data/landing-mirror";
import { mirrorSyncBodySchema } from "@/lib/validations/landing-mirror";

export const maxDuration = 60;

/** Sync now, or preview it (admin). middleware does not cover /api, so gate here. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = mirrorSyncBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const result = await runMirror(parsed.data.pageId, { preview: parsed.data.preview === true });
    if (!result.ok && (result.error === MIRROR_PAGE_NOT_FOUND || result.error === MIRROR_NO_SHEET)) {
      return NextResponse.json({ error: "Page not found or no sheet linked" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    console.error("[sheet-mirror] sync failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
