import { NextRequest, NextResponse } from "next/server";
import { getCourseBySlug, getCurriculum } from "@/lib/data/lms";

/**
 * Public curriculum preview for a course. Wraps the existing
 * course_curriculum RPC (security definer, already granted to anon —
 * see 0007_lms_functions.sql), which returns titles + lock status only,
 * never lesson content. Anon callers see every lesson as "locked".
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course || !course.isPublished) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const modules = await getCurriculum(course.id);
  return NextResponse.json({ modules });
}
