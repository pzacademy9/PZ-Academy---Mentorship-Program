import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getModuleNotes, updateModuleNotes } from "@/lib/data/admin-lms";
import { moduleNotesUpdateSchema } from "@/lib/validations/admin-lms";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  return NextResponse.json(await getModuleNotes(moduleId));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const parsed = moduleNotesUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateModuleNotes(moduleId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (result.reason === "flat-type") {
      return NextResponse.json({ error: "Only courses have module notes" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save these notes" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
