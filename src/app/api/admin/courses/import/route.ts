import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { readImportText } from "@/lib/lms/course-import/read-body";
import { createCourseFromPlan } from "@/lib/data/course-import";

export const maxDuration = 60;

const FAILED = {
  errors: ["Something went wrong while creating the course. Nothing was saved; please try again."],
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await readImportText(req);
  if ("response" in body) return body.response;

  // Always re-analyse the text; never trust a plan sent by the browser.
  const analysis = analyzeCourseFile(body.text);
  if (!analysis.ok) return NextResponse.json({ errors: analysis.errors }, { status: 400 });

  try {
    const created = await createCourseFromPlan(analysis.plan);
    if (!created.ok) return NextResponse.json(FAILED, { status: 500 });
    return NextResponse.json(
      { id: created.id, slug: created.slug, warnings: analysis.warnings, summary: analysis.summary },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(FAILED, { status: 500 });
  }
}
