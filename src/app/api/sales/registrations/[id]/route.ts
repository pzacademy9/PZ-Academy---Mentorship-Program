import { NextRequest, NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { changeRegistrationStatus, type Actor } from "@/lib/data/landing-registration-admin";
import { statusChangeBodySchema } from "@/lib/validations/landing-registration-status";
import { statusChangeResponse } from "@/lib/landing/registration/status-change-response";

/**
 * Manually change a registration's payment status (sales agent or admin).
 * The real role goes into the actor: the data layer scopes a sales_agent to their own rows.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = statusChangeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const role: Actor["role"] = auth.role === "sales_agent" ? "sales_agent" : auth.role === "super_admin" ? "super_admin" : "admin";
  const result = await changeRegistrationStatus({
    registrationId: id,
    to: parsed.data.status,
    expectedFrom: parsed.data.from,
    amount: parsed.data.amount ?? null,
    actor: { userId: auth.user.id, role },
  });
  return statusChangeResponse(result);
}
