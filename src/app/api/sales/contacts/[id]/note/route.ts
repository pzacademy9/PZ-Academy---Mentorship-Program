import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { addNote } from "@/lib/data/sales-contacts";
import { noteSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = noteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await addNote({ id: auth.user.id, role: auth.role }, id, parsed.data.body);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not save the note.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
