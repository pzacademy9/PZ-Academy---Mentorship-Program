import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { LessonDocument } from "@/lib/data/lms";

// GAS_WEBAPP_URL is reserved for the feedback system in production; this
// bridge (shared with sheets-sync per gas/sheets-sync/Code.gs) lives at
// GAS_SHEETS_SYNC_URL instead.
const GAS_URL = process.env.GAS_SHEETS_SYNC_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/**
 * Streams one module-notes document. Access is enforced by RLS: the student's
 * own Supabase client reads module_notes, whose policy (can_access_module)
 * hides the row from anyone not unlocked on the module. The admin client is
 * deliberately not used here. The requested fileId must also belong to this
 * module's own `documents` list, so a fileId from another module cannot be
 * fetched through this URL.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id, fileId } = await params;
  const supabase = await createServerSupabase();

  const { data: notes } = await supabase.from("module_notes").select("documents").eq("module_id", id).maybeSingle();
  if (!notes) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = (notes.documents as unknown as LessonDocument[] | null) ?? [];
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
