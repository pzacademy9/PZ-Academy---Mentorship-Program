import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { moveStudents, previewMove } from "@/lib/data/portals";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { moveBodySchema, moveQuerySchema } from "@/lib/validations/landing-portal";

export const maxDuration = 60;

/** Count who would move to another portal, changing nothing (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin("enrollments");
  if (!auth.ok) return auth.response;

  const sp = new URL(req.url).searchParams;
  const parsed = moveQuerySchema.safeParse({ pageId: sp.get("pageId"), toCourseId: sp.get("toCourseId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await previewMove(parsed.data.pageId, parsed.data.toCourseId));
  } catch (e) {
    return portalErrorResponse(e, "move preview");
  }
}

/** Move this page's students to another portal (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin("enrollments");
  if (!auth.ok) return auth.response;

  const parsed = moveBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await moveStudents(parsed.data.pageId, parsed.data.toCourseId));
  } catch (e) {
    return portalErrorResponse(e, "move");
  }
}
