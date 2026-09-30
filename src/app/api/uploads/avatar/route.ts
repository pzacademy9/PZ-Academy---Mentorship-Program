import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// GAS_WEBAPP_URL is reserved for the feedback system in production; this
// bridge (shared with sheets-sync per gas/sheets-sync/Code.gs) lives at
// GAS_SHEETS_SYNC_URL instead.
const GAS_URL = process.env.GAS_SHEETS_SYNC_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Uploads a user's own profile photo to Google Drive via the GAS bridge --
 * reuses the "uploadCourseImage" GAS action (same backend already proven by
 * /api/admin/uploads/image, no GAS-side changes needed), since this
 * repo never touches Supabase Storage for files. Any authenticated user may
 * upload their own avatar -- no role gate, mirrors
 * /api/uploads/payment-screenshot.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!GAS_URL || !GAS_SHARED_SECRET) {
    return NextResponse.json({ error: "Image upload is not configured yet." }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image received" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WEBP, or GIF images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const ext = file.type.split("/")[1];
  const filename = `avatar_${Date.now()}.${ext}`;

  const gasRes = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "uploadCourseImage",
      secret: GAS_SHARED_SECRET,
      courseSlug: user.id,
      kind: "avatar",
      mimeType: file.type,
      base64,
      filename,
    }),
  });

  if (!gasRes.ok) {
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const json: { ok: boolean; url?: string; error?: string } = await gasRes.json();
  if (!json.ok || !json.url) {
    return NextResponse.json({ error: json.error ?? "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({ url: json.url });
}
