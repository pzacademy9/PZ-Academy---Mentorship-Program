import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getBudgetsForAgent } from "@/lib/data/sales-numbers";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const isAdmin = auth.role === "admin" || auth.role === "super_admin";
  const result = await getBudgetsForAgent(auth.user.id, isAdmin);
  if (!result.ok) return NextResponse.json({ error: "Could not load your sending budget." }, { status: 500 });
  return NextResponse.json({ budgets: result.budgets });
}
