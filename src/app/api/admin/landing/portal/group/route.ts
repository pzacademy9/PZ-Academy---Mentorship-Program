import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setPortalGroup } from "@/lib/data/portals";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { groupPortalBodySchema } from "@/lib/validations/landing-portal";

/** Set a portal's group and batch label (admin). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin("courses");
  if (!auth.ok) return auth.response;

  const parsed = groupPortalBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await setPortalGroup(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return portalErrorResponse(e, "group");
  }
}
