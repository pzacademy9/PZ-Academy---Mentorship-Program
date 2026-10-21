import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/validations/participants";
import { sendStatusEmailAgain } from "@/lib/landing/registration/job-handlers";

const bodySchema = z.object({
  kind: z.enum(["received", "paid", "underpaid", "reserved"]),
  confirmedAgain: z.boolean().optional(),
});

/** Send one status email to one person again (admin). Email text only: never changes status or access. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await sendStatusEmailAgain({ registrationId: id, kind: parsed.data.kind, confirmedAgain: parsed.data.confirmedAgain === true });
  if (result.ok) return NextResponse.json({ ok: true });
  switch (result.reason) {
    case "not-found":
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    case "needs-confirm":
      return NextResponse.json({ error: "This person already got this email.", code: "needs-confirm", sentAt: result.sentAt }, { status: 409 });
    case "not-allowed":
      return NextResponse.json({ error: "This email cannot be sent to this person." }, { status: 422 });
    default:
      return NextResponse.json({ error: "The email could not be sent. Try again." }, { status: 502 });
  }
}
