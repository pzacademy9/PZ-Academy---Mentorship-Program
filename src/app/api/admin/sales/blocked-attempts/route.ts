import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listBlockedAttempts } from "@/lib/data/sales-numbers";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const result = await listBlockedAttempts();
  if (!result.ok) return NextResponse.json({ error: "Could not load the log." }, { status: 500 });
  return NextResponse.json({ rows: result.rows });
}
