import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { copyModule } from "@/lib/data/admin-lms";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const result = await copyModule(moduleId);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (result.reason === "flat-type") {
      return NextResponse.json({ error: "Only courses have modules to copy" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not copy this module" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id, filesToReupload: result.filesToReupload ?? 0 }, { status: 201 });
}
