import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// GAS_WEBAPP_URL is reserved for the feedback system in production; this
// bridge (shared with sheets-sync per gas/sheets-sync/Code.gs) lives at
// GAS_SHEETS_SYNC_URL instead.
const GAS_URL = process.env.GAS_SHEETS_SYNC_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/**
 * Streams a lesson's private PDF (content_type="pdf") to the browser. The
 * only gate is the session-scoped select below going through RLS policy
 * "lessons: read if unlocked or admin" (0007_lms_functions.sql) — a null
 * result here means "not allowed," so this can never drift out of sync with
 * the drip-unlock rules that gate everything else about a lesson. The raw
 * Drive file ID never reaches the client; only these bytes do.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: lesson } = await supabase.from("lessons").select("pdf_file_id").eq("id", id).maybeSingle();
  if (!lesson?.pdf_file_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!GAS_URL || !GAS_SHARED_SECRET) {
    return NextResponse.json({ error: "Document delivery is not configured yet." }, { status: 500 });
  }

  const gasRes = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fetchPrivateDocument",
      secret: GAS_SHARED_SECRET,
      fileId: lesson.pdf_file_id,
    }),
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
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
