import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { copyCourse } from "@/lib/data/admin-lms";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await copyCourse(id);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Program not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not copy this program" }, { status: 500 });
  }
  return NextResponse.json(
    { id: result.id, slug: result.slug, filesToReupload: result.filesToReupload },
    { status: 201 },
  );
}
