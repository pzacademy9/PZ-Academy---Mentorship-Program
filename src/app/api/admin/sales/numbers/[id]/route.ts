import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateNumber } from "@/lib/data/sales-numbers";
import { numberUpdateSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = numberUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await updateNumber(id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not update this number.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true });
}
