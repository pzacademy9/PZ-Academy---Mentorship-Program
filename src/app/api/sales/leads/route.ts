import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { addLead } from "@/lib/data/sales-contacts";
import { leadSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = leadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await addLead({ id: auth.user.id, role: auth.role }, parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid-phone") {
      return NextResponse.json({ error: "Enter a valid phone number with its country code (e.g. +92 300 1234567 or 03001234567).", reason: "invalid-phone" }, { status: 400 });
    }
    if (result.reason === "duplicate") {
      return NextResponse.json(
        { error: "This person is already in the CRM.", reason: "duplicate", contactId: result.contactId, ownerName: result.ownerName },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not save this lead.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, contactId: result.contactId }, { status: 201 });
}
