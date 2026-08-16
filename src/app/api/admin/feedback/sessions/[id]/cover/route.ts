import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setFeedbackSessionCover } from "@/lib/data/feedback-sessions";
import { uploadFeedbackCover } from "@/lib/gas/feedback-upload-client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("cover") as File | null;
  if (!file) return NextResponse.json({ error: "No file received" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await uploadFeedbackCover({ sessionId: id, mimeType: file.type || "image/jpeg", base64, filename: file.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  await setFeedbackSessionCover(id, result.url, auth.user.id);
  return NextResponse.json({ coverUrl: result.url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await setFeedbackSessionCover(id, null, auth.user.id);
  return NextResponse.json({ ok: true });
}
