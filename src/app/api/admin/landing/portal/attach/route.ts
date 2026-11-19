import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { attachPortal } from "@/lib/data/portals";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { attachPortalBodySchema } from "@/lib/validations/landing-portal";

/** Point the registration page at an existing portal (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["enrollments", "landing_pages"]);
  if (!auth.ok) return auth.response;

  const parsed = attachPortalBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await attachPortal(parsed.data.pageId, parsed.data.courseId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalErrorResponse(e, "attach");
  }
}
