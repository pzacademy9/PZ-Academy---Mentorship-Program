import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyApplicationStatus } from "@/lib/data/mentorship-applications";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await applyApplicationStatus({
    applicationId: id,
    targetStatus: parsed.data.status,
    rejectionReason: parsed.data.reason ?? null,
    emailKind: parsed.data.status === "approved" ? "applicationApproved" : "applicationRejected",
  });

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Application is already ${parsed.data.status}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update application" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}
