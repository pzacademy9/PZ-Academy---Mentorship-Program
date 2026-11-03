import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { changeRegistrationStatus } from "@/lib/data/landing-registration-admin";
import { deleteRegistration } from "@/lib/data/landing-registration-delete";
import { statusChangeBodySchema } from "@/lib/validations/landing-registration-status";
import { statusChangeResponse } from "@/lib/landing/registration/status-change-response";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Delete a registration for good (admin only). A group lead takes its members with it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  const result = await deleteRegistration({ registrationId: id });
  if (result.ok) return NextResponse.json({ ok: true, removedMembers: result.removedMembers });
  switch (result.reason) {
    case "not-found":
    case "member-row":
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    case "sheet-error":
      return NextResponse.json({ error: "Could not remove the row from the Google Sheet, so nothing was deleted. Try again in a minute." }, { status: 502 });
    default:
      return NextResponse.json({ error: "Could not delete this registration. Try again." }, { status: 500 });
  }
}

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
    sendEmail: parsed.data.sendEmail,
    actor: { userId: auth.user.id, role: "admin" },
  });
  return statusChangeResponse(result);
}
