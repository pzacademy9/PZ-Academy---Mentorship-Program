// src/app/api/admin/landing-media/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateMedia, deleteMedia } from "@/lib/data/landing-media";
import { MEDIA_FOLDERS, type MediaFolder } from "@/lib/landing/media";
import { isPageId } from "@/lib/validations/landing";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Picture not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; folder?: unknown } | null;
  const patch: { name?: string; folder?: MediaFolder } = {};
  if (body?.name !== undefined) {
    if (typeof body.name !== "string") return NextResponse.json({ error: "That name is not valid." }, { status: 400 });
    patch.name = body.name;
  }
  if (body?.folder !== undefined) {
    const folder = MEDIA_FOLDERS.find((m) => m.key === body.folder)?.key;
    if (!folder) return NextResponse.json({ error: "That folder is not valid." }, { status: 400 });
    patch.folder = folder;
  }

  const result = await updateMedia(id, patch);
  if (!result.ok) {
    if (result.reason === "invalid") return NextResponse.json({ error: "That name or folder is not valid." }, { status: 400 });
    if (result.reason === "not-found") return NextResponse.json({ error: "Picture not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not update the picture" }, { status: 500 });
  }
  return NextResponse.json({ item: result.item });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Picture not found" }, { status: 404 });

  const result = await deleteMedia(id);
  if (!result.ok) {
    if (result.reason === "in-use") {
      const titles = result.pages.map((p) => p.title).join(", ");
      return NextResponse.json(
        { error: `This picture is used by: ${titles}. Remove it from those pages first.`, pages: result.pages },
        { status: 409 },
      );
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Picture not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete the picture" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
