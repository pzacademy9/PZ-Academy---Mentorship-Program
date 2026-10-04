import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assignContacts } from "@/lib/data/sales-contacts";
import { assignSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = assignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await assignContacts(
    { id: auth.user.id, role: "admin" },
    parsed.data.contactIds,
    parsed.data.agentId,
  );
  if (!result.ok) {
    const error = result.reason === "invalid-agent" ? "That person is not a sales agent." : "Could not assign these contacts.";
    return NextResponse.json({ error, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, count: result.count });
}
