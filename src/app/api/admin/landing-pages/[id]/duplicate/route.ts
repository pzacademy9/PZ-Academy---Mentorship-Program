// src/app/api/admin/landing-pages/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { duplicateLandingPage } from "@/lib/data/landing-pages";
import { duplicateSchema, isPageId } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const parsed = duplicateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await duplicateLandingPage(auth.user.id, id, parsed.data);
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return NextResponse.json({ error: "A page with that link already exists. Please choose a different link." }, { status: 409 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not duplicate the page" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
