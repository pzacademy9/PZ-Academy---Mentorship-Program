import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyEnrollmentStatus } from "@/lib/data/admin-enrollments";
import {
  reviewActionSchema,
  ACTION_TARGET_STATUS,
  composeRejectionReason,
  type ReviewActionName,
} from "@/lib/validations/admin-enrollment";

/** Which enrollment email each action triggers. 'expire' notifies nobody. */
const ACTION_EMAIL = {
  approve: "approved",
  reserve: "reserved",
  reject: "rejected",
  expire: null,
} as const satisfies Record<ReviewActionName, "approved" | "reserved" | "rejected" | null>;

/**
 * Approve / reserve / reject / expire a single enrollment.
 *
 * middleware.ts only role-checks under /dashboard, so this route does its own
 * admin gate — see requireAdmin. The actual transition, email, and sheet push
 * all happen inside applyEnrollmentStatus (src/lib/data/admin-enrollments.ts)
 * — this route's only job is turning a review action into that call's params.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = reviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const action = parsed.data;
  const target = ACTION_TARGET_STATUS[action.action];

  const result = await applyEnrollmentStatus({
    enrollmentId: id,
    targetStatus: target,
    verifiedBy: auth.user.id,
    rejectionReason: action.action === "reject" ? composeRejectionReason(action.reason, action.note) : null,
    clearShortfall: true,
    emailKind: ACTION_EMAIL[action.action],
  });

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Enrollment is already ${target}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update enrollment" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}
