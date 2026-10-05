import { NextRequest, NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { listContacts } from "@/lib/data/sales-contacts";
import { contactsQuerySchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function GET(req: NextRequest) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = contactsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await listContacts({ id: auth.user.id, role: auth.role }, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not load contacts.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ rows: result.rows, total: result.total, pageSize: result.pageSize });
}
