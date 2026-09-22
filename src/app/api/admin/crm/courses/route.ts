import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listCoursesForTagging } from "@/lib/data/admin-crm-import";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const courses = await listCoursesForTagging();
    return NextResponse.json({ courses });
  } catch {
    return NextResponse.json({ error: "Could not load courses" }, { status: 500 });
  }
}
