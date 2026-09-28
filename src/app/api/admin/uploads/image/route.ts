import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Uploads a course-facing image (mentor avatar today; thumbnail/banner reuse
 * this same relay later per the plan) to Google Drive via the GAS bridge —
 * never Supabase Storage, matching every other file in this app. Mirrors the
 * base64-relay pattern in /api/uploads/payment-screenshot; the only
 * difference is this one is admin-gated and the resulting file stays
 * PUBLIC (ANYONE_WITH_LINK), since these are marketing assets, not protected
 * content.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

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

  const courseSlug = String(form?.get("courseSlug") ?? "uncategorized");
  const kind = String(form?.get("kind") ?? "image");

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const ext = file.type.split("/")[1];
  const filename = `${kind}_${Date.now()}.${ext}`;

  let gasRes: Response;
  try {
    gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadCourseImage",
        secret: GAS_SHARED_SECRET,
        courseSlug,
        kind,
        mimeType: file.type,
        base64,
        filename,
      }),
      // Next.js 14.2.x has a flagged fetch-memoization bug (see the
      // next@14.2.5 vulnerability warning in the build log) where an
      // unrelated cached response could be replayed for this call — this
      // route's request body is unique per upload anyway, so opting out of
      // caching entirely is both the safe default and the concrete fix for
      // that class of bug.
      cache: "no-store",
    });
  } catch (err) {
    console.error("[uploads-image] GAS request failed:", err);
    return NextResponse.json({ error: `Could not reach the upload service: ${String(err)}` }, { status: 502 });
  }

  if (!gasRes.ok) {
    const bodyText = await gasRes.text().catch(() => "");
    console.error("[uploads-image] GAS returned non-OK status:", gasRes.status, bodyText.slice(0, 500));
    return NextResponse.json(
      { error: `Upload failed (GAS status ${gasRes.status}): ${bodyText.slice(0, 300)}` },
      { status: 502 },
    );
  }

  let json: { ok: boolean; url?: string; error?: string };
  try {
    json = await gasRes.json();
  } catch (err) {
    const bodyText = await gasRes.text().catch(() => "");
    console.error("[uploads-image] GAS response was not valid JSON:", bodyText.slice(0, 500), err);
    return NextResponse.json(
      { error: `Upload service returned an unexpected response: ${bodyText.slice(0, 300)}` },
      { status: 502 },
    );
  }
  if (!json.ok || !json.url) {
    return NextResponse.json({ error: json.error ?? "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({ url: json.url });
}
