import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { readImportText } from "@/lib/lms/course-import/read-body";
import { compareCurriculum } from "@/lib/lms/course-import/compare";
import { changeFingerprint } from "@/lib/lms/course-import/fingerprint";
import { loadCurrentCurriculum } from "@/lib/data/course-curriculum-import";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("courses");
  if (!auth.ok) return auth.response;

  const body = await readImportText(req);
  if ("response" in body) return body.response;

  const { id } = await params;
  let current;
  try {
    current = await loadCurrentCurriculum(id);
  } catch {
    return NextResponse.json({ errors: ["Could not read the program. Please try again."] }, { status: 500 });
  }
  if (!current) return NextResponse.json({ errors: ["Program not found."] }, { status: 404 });

  const result = analyzeCourseFile(body.text);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
  if (result.plan.type !== current.type) {
    return NextResponse.json({ errors: ["This file is for a different kind of program."] }, { status: 400 });
  }

  const changes = compareCurriculum(current.curriculum, result.plan).map((c) => ({
    ...c,
    fingerprint: changeFingerprint(current.curriculum, c),
  }));
  return NextResponse.json({ type: current.type, warnings: result.warnings, changes });
}
