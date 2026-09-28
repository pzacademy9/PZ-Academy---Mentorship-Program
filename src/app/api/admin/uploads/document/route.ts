import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf"];

/**
 * Uploads a lesson PDF or Supporting Document to a PRIVATE Drive file via the
 * GAS bridge — unlike /api/admin/uploads/image, this never sets
 * ANYONE_WITH_LINK sharing (see handleUploadPrivateDocument_ in
 * gas/payment-screenshots/Code.gs). The response is a bare fileId, never a
 * Drive URL — students only ever reach the bytes through the gated stream
 * routes in /api/lessons/[id]/pdf and /api/lessons/[id]/documents/[fileId].
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!GAS_URL || !GAS_SHARED_SECRET) {
    return NextResponse.json({ error: "Document upload is not configured yet." }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Document must be 25MB or smaller." }, { status: 400 });
  }

  const courseSlug = String(form?.get("courseSlug") ?? "uncategorized");

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const gasRes = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "uploadPrivateDocument",
      secret: GAS_SHARED_SECRET,
      courseSlug,
      mimeType: file.type,
      base64,
      filename: file.name,
    }),
  });

  if (!gasRes.ok) {
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const json: { ok: boolean; fileId?: string; error?: string } = await gasRes.json();
  if (!json.ok || !json.fileId) {
    return NextResponse.json({ error: json.error ?? "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({ fileId: json.fileId, name: file.name });
}
