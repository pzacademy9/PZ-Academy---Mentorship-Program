import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { LessonDocument } from "@/lib/data/lms";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/**
 * Streams one Supporting Document. Same RLS-gated access model as
 * /api/lessons/[id]/pdf, plus one extra check: the requested fileId must
 * actually belong to this lesson's own `documents` list. Without that check,
 * a student unlocked on lesson A could pass lesson B's fileId (if ever
 * learned some other way) through lesson A's URL and still fetch it, since
 * fetchPrivateDocument itself takes a bare fileId with no lesson linkage.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const supabase = await createServerSupabase();

  const { data: lesson } = await supabase.from("lessons").select("documents").eq("id", id).maybeSingle();
  if (!lesson) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = (lesson.documents as unknown as LessonDocument[] | null) ?? [];
  const doc = documents.find((d) => d.fileId === fileId);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!GAS_URL || !GAS_SHARED_SECRET) {
    return NextResponse.json({ error: "Document delivery is not configured yet." }, { status: 500 });
  }

  const gasRes = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "fetchPrivateDocument", secret: GAS_SHARED_SECRET, fileId }),
  });
  if (!gasRes.ok) {
    return NextResponse.json({ error: "Could not load document" }, { status: 502 });
  }

  const json: { ok: boolean; base64?: string; mimeType?: string; error?: string } = await gasRes.json();
  if (!json.ok || !json.base64) {
    return NextResponse.json({ error: json.error ?? "Could not load document" }, { status: 502 });
  }

  return new NextResponse(Buffer.from(json.base64, "base64"), {
    headers: {
      "Content-Type": json.mimeType ?? "application/pdf",
      "Content-Disposition": `inline; filename="${doc.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
