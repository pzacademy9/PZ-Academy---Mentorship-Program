import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteFeedbackResponse, setResponseFeatured, setResponseVisibility } from "@/lib/data/feedback-responses";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, responseId } = await params;
  try {
    await deleteFeedbackResponse(responseId, id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete response." }, { status: 400 });
  }
}

const patchSchema = z
  .object({ isPublic: z.boolean().optional(), isFeatured: z.boolean().optional() })
  .refine((v) => (v.isPublic !== undefined) !== (v.isFeatured !== undefined), {
    message: "Provide exactly one of isPublic or isFeatured",
  });

/** Toggles a single response's visibility or featured state on the public mentor-profile reviews section. See setResponseVisibility/setResponseFeatured for what these do NOT affect. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, responseId } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    if (parsed.data.isPublic !== undefined) {
      await setResponseVisibility(responseId, id, parsed.data.isPublic, auth.user.id);
    } else {
      await setResponseFeatured(responseId, id, parsed.data.isFeatured!, auth.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not update this response." }, { status: 400 });
  }
}
