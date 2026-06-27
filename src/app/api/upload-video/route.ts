import { NextRequest, NextResponse } from "next/server";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";

// Allow up to 20 MB for video uploads (well above any 30s recording)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!GAS_URL) {
    return NextResponse.json(
      { ok: false, error: "GAS_WEBAPP_URL not configured." },
      { status: 500 }
    );
  }

  try {
    const form        = await req.formData();
    const file        = form.get("video") as File | null;
    const sessionId   = String(form.get("sessionId")   ?? "");
    const sessionName = String(form.get("sessionName") ?? "");

    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, error: "No video file received." }, { status: 400 });
    }

    // Client-side check should catch this, but guard on the server too
    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Video is too large. Please keep it under 20 MB." },
        { status: 413 }
      );
    }

    // Convert to base64 for GAS (GAS cannot receive multipart directly)
    const arrayBuffer = await file.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString("base64");
    const ext         = file.type.includes("mp4") ? "mp4" : "webm";
    const filename    = `${sessionId}_${Date.now()}.${ext}`;

    const gasRes = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadVideo",
        sessionId,
        sessionName,
        mimeType: file.type || "video/webm",
        base64,
        filename,
      }),
    });

    const json = await gasRes.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 }
    );
  }
}
