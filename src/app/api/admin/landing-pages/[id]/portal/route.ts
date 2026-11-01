// src/app/api/admin/landing-pages/[id]/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setPortalVisibility } from "@/lib/data/landing-pages";
import { portalVisibilitySchema, isPageId } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const parsed = portalVisibilitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send show as true or false." }, { status: 400 });

  const result = await setPortalVisibility(id, parsed.data.show);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, show: parsed.data.show });
}
