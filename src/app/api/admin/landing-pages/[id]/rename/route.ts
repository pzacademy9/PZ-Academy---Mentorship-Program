// src/app/api/admin/landing-pages/[id]/rename/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { renameLandingPage } from "@/lib/data/landing-pages";
import { renameSchema, isPageId } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const parsed = renameSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Give the page a name." }, { status: 400 });
  }

  const result = await renameLandingPage(id, parsed.data.title);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not rename the page" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, title: parsed.data.title });
}
