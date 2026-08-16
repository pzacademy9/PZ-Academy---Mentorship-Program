import "server-only";

const GAS_URL = process.env.FEEDBACK_UPLOAD_GAS_URL ?? "";
const GAS_SECRET = process.env.FEEDBACK_UPLOAD_GAS_SECRET ?? "";

type UploadResult = { ok: true; url: string } | { ok: false; error: string };

async function post(action: "uploadVideo" | "uploadCover", body: Record<string, string>): Promise<UploadResult> {
  if (!GAS_URL || !GAS_SECRET) return { ok: false, error: "Feedback upload proxy not configured." };
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: GAS_SECRET, action, ...body }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export function uploadFeedbackVideo(params: {
  sessionId: string;
  sessionName: string;
  mimeType: string;
  base64: string;
  filename: string;
}): Promise<UploadResult> {
  return post("uploadVideo", params);
}

export function uploadFeedbackCover(params: {
  sessionId: string;
  mimeType: string;
  base64: string;
  filename: string;
}): Promise<UploadResult> {
  return post("uploadCover", params);
}
