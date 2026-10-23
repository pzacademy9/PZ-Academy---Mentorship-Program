import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { readImportText } from "@/lib/lms/course-import/read-body";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await readImportText(req);
  if ("response" in body) return body.response;

  const result = analyzeCourseFile(body.text);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  return NextResponse.json({
    title: result.plan.title,
    type: result.plan.type,
    warnings: result.warnings,
    summary: result.summary,
  });
}
