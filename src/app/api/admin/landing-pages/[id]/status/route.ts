// src/app/api/admin/landing-pages/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setPageStatus } from "@/lib/data/landing-pages";
import { statusSchema } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await setPageStatus(id, parsed.data.status);
  if (!result.ok) {
    if (result.reason === "not-published") {
      return NextResponse.json({ error: "Publish the page first." }, { status: 409 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not change the status" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
