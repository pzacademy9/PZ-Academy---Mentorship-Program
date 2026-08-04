import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setCoursePublished } from "@/lib/data/admin-lms";

const bodySchema = z.object({ publish: z.boolean() });

/**
 * Flips is_published. Unpublishing always succeeds; publishing is hard-blocked
 * at zero sessions (see publishEligibility in src/lib/validations/admin-lms.ts).
 * The Builder's Draft|Published pill (Part C) is the primary caller.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await setCoursePublished(id, parsed.data.publish);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    if (result.reason === "zero-sessions") {
      return NextResponse.json({ error: result.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not update publish state" }, { status: 500 });
  }

  return NextResponse.json({ isPublished: result.isPublished, warning: result.warning });
}
