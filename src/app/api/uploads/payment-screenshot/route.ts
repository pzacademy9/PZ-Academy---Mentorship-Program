import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { screenshotUploadSchema } from "@/lib/validations/enrollment";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

/**
 * Uploads a payment screenshot to Google Drive via the GAS bridge (never
 * Supabase Storage). Mirrors the base64-relay pattern already proven in the
 * mentorship portal's /api/upload-video route, since GAS cannot receive
 * multipart bodies directly.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!GAS_URL) {
    return NextResponse.json(
      { error: "Screenshot upload is not configured yet." },
      { status: 500 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("screenshot");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No screenshot received" }, { status: 400 });
  }
  const courseSlug = String(form?.get("courseSlug") ?? "");

  const parsed = screenshotUploadSchema.safeParse({
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const ext = parsed.data.mimeType.split("/")[1];
  const filename = `payment_${user.id}_${Date.now()}.${ext}`;

  const gasRes = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "uploadPaymentScreenshot",
      secret: GAS_SHARED_SECRET,
      studentId: user.id,
      courseSlug,
      mimeType: parsed.data.mimeType,
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
