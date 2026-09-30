import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { manualConversionCreateSchema } from "@/lib/validations/crm";
import { createManualConversions } from "@/lib/data/admin-crm-manual-conversions";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = manualConversionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { contactIds, program, convertedAt, note } = parsed.data;
  const result = await createManualConversions(contactIds, program, convertedAt, note, auth.user.id);
  if (!result.ok) return NextResponse.json({ error: "Could not record this conversion." }, { status: 500 });

  return NextResponse.json({ ok: true, count: result.count });
}
