import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { analyzeCourseFile } from "@/lib/lms/course-import/analyze";
import { readImportText } from "@/lib/lms/course-import/read-body";
import { compareCurriculum } from "@/lib/lms/course-import/compare";
import { applyCurriculumChanges, loadCurrentCurriculum } from "@/lib/data/course-curriculum-import";

export const maxDuration = 60;

const idsSchema = z.object({ ids: z.array(z.string().max(200)).max(5000) });

// The browser is not trusted: the file is read again, the program is loaded
// again, the rows are worked out again, and only ticked ids that match are applied.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("courses");
  if (!auth.ok) return auth.response;

  const copy = req.clone();
  const body = await readImportText(req);
  if ("response" in body) return body.response;

  const parsedIds = idsSchema.safeParse(await copy.json().catch(() => null));
  const ids = parsedIds.success ? parsedIds.data.ids : [];
  if (ids.length === 0) return NextResponse.json({ errors: ["Nothing is ticked."] }, { status: 400 });

  const { id } = await params;
  const result = analyzeCourseFile(body.text);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

  let current;
  try {
    current = await loadCurrentCurriculum(id);
  } catch {
    return NextResponse.json({ errors: ["Could not read the program. Please try again."] }, { status: 500 });
  }
  if (!current) return NextResponse.json({ errors: ["Program not found."] }, { status: 404 });
  if (result.plan.type !== current.type) {
    return NextResponse.json({ errors: ["This file is for a different kind of program."] }, { status: 400 });
  }

  const rows = compareCurriculum(current.curriculum, result.plan);
  const wanted = new Set(ids);
  const known = new Set(rows.map((r) => r.id));
  if (ids.some((x) => !known.has(x))) {
    return NextResponse.json({ errors: ["The program changed. Check the file again."] }, { status: 409 });
  }

  try {
    const applied = await applyCurriculumChanges(id, result.plan, rows.filter((r) => wanted.has(r.id)));
    if (!applied.ok) {
      return NextResponse.json({ errors: [applied.message], applied: applied.applied }, { status: 500 });
    }
    return NextResponse.json({ applied: applied.applied });
  } catch {
    return NextResponse.json({ errors: ["Something went wrong. Please try again."] }, { status: 500 });
  }
}
