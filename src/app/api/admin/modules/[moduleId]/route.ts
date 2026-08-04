import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateModule, deleteModule } from "@/lib/data/admin-lms";
import { moduleUpdateSchema } from "@/lib/validations/admin-lms";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const parsed = moduleUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateModule(moduleId, parsed.data.title);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not rename this module" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

const deleteBodySchema = z.object({ confirm: z.boolean().default(false) });

/**
 * Guarded delete. A module whose lessons have student progress or quiz
 * attempts needs `{ confirm: true }` to proceed, and is blocked outright if
 * the program is published with active enrollments (see deleteModule in
 * src/lib/data/admin-lms.ts and the plan's delete-guards table).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const { confirm } = deleteBodySchema.parse(await req.json().catch(() => ({})));

  const result = await deleteModule(moduleId, confirm);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (result.reason === "needs-confirmation") {
      return NextResponse.json(
        {
          error: `This module has ${result.recordCount} student progress/quiz record(s). Confirm to delete anyway.`,
          needsConfirmation: true,
          recordCount: result.recordCount,
        },
        { status: 409 },
      );
    }
    if (result.reason === "blocked-published-active") {
      return NextResponse.json(
        {
          error: `This program is published with active enrollments and has ${result.recordCount} student record(s) under this module. Unpublish it before deleting.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not delete this module" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
