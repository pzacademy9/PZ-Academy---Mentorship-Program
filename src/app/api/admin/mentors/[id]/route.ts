import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateMentorConfig, deleteMentor } from "@/lib/data/admin-mentors";
import { mentorConfigSchema } from "@/lib/validations/admin-mentor";

/** Saves the Configuration form. No slug in the body — slug is immutable, see mentorConfigSchema. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mentorConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateMentorConfig(id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning: result.warning });
}

/** Guarded delete — blocked outright if the mentor has any booking on record. Hidden is the offered alternative. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteMentor(id);

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    if (result.reason === "has-bookings") {
      return NextResponse.json(
        {
          error: `This mentor has ${result.bookingCount} booking${result.bookingCount === 1 ? "" : "s"} on record and can't be deleted. Set visibility to Hidden instead.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not delete this mentor" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning: result.warning });
}
