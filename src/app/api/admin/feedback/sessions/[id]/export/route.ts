import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { exportFeedbackSessionCsv } from "@/lib/data/feedback-responses";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await exportFeedbackSessionCsv(id);
  if (!result) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return new NextResponse(result.csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${result.filename}"` },
  });
}
