// src/app/api/admin/landing-pages/[id]/rollback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rollbackLandingPage } from "@/lib/data/landing-pages";
import { rollbackSchema } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = rollbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await rollbackLandingPage(auth.user.id, id, parsed.data.version);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not restore that version" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
