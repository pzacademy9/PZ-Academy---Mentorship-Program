// src/app/api/admin/landing-media/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listMedia, addMedia } from "@/lib/data/landing-media";
import { MEDIA_FOLDERS, type MediaFolder } from "@/lib/landing/media";

const asFolder = (f: unknown): MediaFolder | undefined =>
  MEDIA_FOLDERS.find((m) => m.key === f)?.key;
const asNumber = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const params = new URL(req.url).searchParams;
  try {
    const items = await listMedia({
      q: params.get("q") ?? undefined,
      folder: asFolder(params.get("folder")),
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Could not load the pictures" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.url !== "string" || typeof body?.name !== "string") {
    return NextResponse.json({ error: "A picture link and a name are needed." }, { status: 400 });
  }
  if (body.folder !== undefined && !asFolder(body.folder)) {
    return NextResponse.json({ error: "That folder is not valid." }, { status: 400 });
  }

  const result = await addMedia(
    {
      url: body.url,
      name: body.name,
      folder: asFolder(body.folder),
      width: asNumber(body.width),
      height: asNumber(body.height),
      sizeBytes: asNumber(body.sizeBytes),
    },
    auth.user.id,
  );
  if (!result.ok) {
    if (result.reason === "invalid") return NextResponse.json({ error: "That picture or name is not valid." }, { status: 400 });
    return NextResponse.json({ error: "Could not save the picture" }, { status: 500 });
  }
  return NextResponse.json({ item: result.item, existing: result.existing }, { status: 201 });
}
