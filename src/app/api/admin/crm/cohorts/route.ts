import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listCohorts } from "@/lib/data/admin-crm-import";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ cohorts: await listCohorts() });
}
