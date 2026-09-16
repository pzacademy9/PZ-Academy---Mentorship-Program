import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listFieldValues } from "@/lib/data/admin-crm-segments";
import { segmentFieldValuesQuerySchema } from "@/lib/validations/crm";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = segmentFieldValuesQuerySchema.safeParse({ field: req.nextUrl.searchParams.get("field") });
  if (!parsed.success) return NextResponse.json({ error: "Unknown field" }, { status: 400 });

  return NextResponse.json({ values: await listFieldValues(parsed.data.field) });
}
