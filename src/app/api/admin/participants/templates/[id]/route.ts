import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteTemplate, saveTemplate } from "@/lib/data/participant-templates";
import { isUuid, templateBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const parsed = templateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const template = await saveTemplate({ ...parsed.data, id, actorId: auth.user.id });
    return NextResponse.json({ template });
  } catch (e) {
    if (e instanceof Error && e.message === "Give the template a name") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("participants saveTemplate failed", e);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  try {
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("participants deleteTemplate failed", e);
    return NextResponse.json({ error: "Could not delete the template" }, { status: 500 });
  }
}
