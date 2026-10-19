import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { changeRegistrationStatus } from "@/lib/data/landing-registration-admin";
import { statusChangeBodySchema } from "@/lib/validations/landing-registration-status";
import { statusChangeResponse } from "@/lib/landing/registration/status-change-response";

/** Manually change a registration's payment status (admin). middleware does not cover /api, so gate here. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = statusChangeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await changeRegistrationStatus({
    registrationId: id,
    to: parsed.data.status,
    expectedFrom: parsed.data.from,
    amount: parsed.data.amount ?? null,
    actor: { userId: auth.user.id, role: "admin" },
  });
  return statusChangeResponse(result);
}
