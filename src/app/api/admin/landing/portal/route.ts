import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getPortalOverview } from "@/lib/data/portals";
import { portalErrorResponse } from "@/lib/data/portal-errors";
import { portalOverviewQuerySchema } from "@/lib/validations/landing-portal";

/** Portal, siblings, groups and copy sources for one registration page (admin). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(["enrollments", "landing_pages", "courses"]);
  if (!auth.ok) return auth.response;

  const parsed = portalOverviewQuerySchema.safeParse({ pageId: new URL(req.url).searchParams.get("pageId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const overview = await getPortalOverview(parsed.data.pageId);
    if (!overview) return NextResponse.json({ error: "That registration page was not found." }, { status: 404 });
    return NextResponse.json(overview);
  } catch (e) {
    return portalErrorResponse(e, "overview");
  }
}
