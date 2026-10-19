import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { emailPortalLinks } from "@/lib/data/landing-batch";
import { portalLinksBodySchema } from "@/lib/validations/landing-batch";

export const maxDuration = 60;

/** Email the portal link to Paid buyers whose portal is open (admin). middleware does not cover /api, so gate here. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = portalLinksBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await emailPortalLinks({ ...parsed.data, adminId: auth.user.id }));
  } catch {
    console.error("[landing-batch] portal links failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
