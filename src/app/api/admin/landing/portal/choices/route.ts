import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyChoice, listChoiceGroups } from "@/lib/data/portal-choices";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { applyChoiceBodySchema, choicesQuerySchema } from "@/lib/validations/landing-choices";

export const maxDuration = 60;

/** Purchase labels on this page that still have no recorded choice, with suggestions (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin("enrollments");
  if (!auth.ok) return auth.response;

  const parsed = choicesQuerySchema.safeParse({ pageId: new URL(req.url).searchParams.get("pageId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await listChoiceGroups(parsed.data.pageId));
  } catch (e) {
    return portalErrorResponse(e, "choices list");
  }
}

/** Record one choice for every person who bought a given label (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin("enrollments");
  if (!auth.ok) return auth.response;

  const parsed = applyChoiceBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await applyChoice(parsed.data));
  } catch (e) {
    return portalErrorResponse(e, "choices apply");
  }
}
