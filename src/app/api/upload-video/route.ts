import { NextRequest, NextResponse } from "next/server";
import { getNativePublicSession } from "@/lib/data/feedback-sessions";
import { uploadFeedbackVideo } from "@/lib/gas/feedback-upload-client";

const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";

// Allow up to 20 MB for video uploads (well above any 30s recording)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form        = await req.formData();
    const file        = form.get("video") as File | null;
    const sessionId       = String(form.get("sessionId")       ?? "");
    const sessionName     = String(form.get("sessionName")     ?? "");
    const participantName = String(form.get("participantName") ?? "");

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

    // Convert to base64 (both the native upload proxy and legacy GAS expect base64, not multipart)
    const arrayBuffer = await file.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString("base64");
    const ext         = file.type.includes("mp4") ? "mp4" : "webm";
    const filename    = `${sessionId}_${Date.now()}.${ext}`;

    // Native sessions upload through the new Drive-upload proxy client.
    const native = await getNativePublicSession(sessionId);
    if (native) {
      const result = await uploadFeedbackVideo({
        sessionId,
        sessionName,
        mimeType: file.type || "video/webm",
        base64,
        filename,
      });
      return NextResponse.json(
        result.ok ? { ok: true, data: { url: result.url } } : { ok: false, error: result.error }
      );
    }

    // Legacy session — unchanged pass-through to the old GAS Feedback System.
    if (!GAS_URL) {
      return NextResponse.json(
        { ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." },
        { status: 500 }
      );
    }

    const gasRes = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadVideo",
        sessionId,
        sessionName,
        participantName,
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
