import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { duplicatePortal } from "@/lib/data/portals";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { duplicatePortalBodySchema } from "@/lib/validations/landing-portal";

/** Copy a portal as a new draft and point the registration page at it (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["enrollments", "landing_pages"]);
  if (!auth.ok) return auth.response;

  const parsed = duplicatePortalBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await duplicatePortal(parsed.data));
  } catch (e) {
    return portalErrorResponse(e, "duplicate");
  }
}
