import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { copyModule } from "@/lib/data/admin-lms";

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const body = (await req.json().catch(() => null)) as { confirm?: boolean } | null;
  const result = await copyModule(moduleId, body?.confirm === true);
  if (!result.ok) {
    if (result.reason === "needs-confirmation") {
      return NextResponse.json(
        {
          error: "This course has students. The copy will appear to them right away. Confirm to copy anyway.",
          needsConfirmation: true,
        },
        { status: 409 },
      );
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Module not found" }, { status: 404 });
    if (result.reason === "flat-type") {
      return NextResponse.json({ error: "Only courses have modules to copy" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not copy this module" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id, filesToReupload: result.filesToReupload ?? 0 }, { status: 201 });
}
