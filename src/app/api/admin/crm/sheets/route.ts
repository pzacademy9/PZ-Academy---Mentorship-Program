import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSheetTabs, guessColumnMapping } from "@/lib/data/admin-crm-import";
import { sheetIdSchema } from "@/lib/validations/crm";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = sheetIdSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await getSheetTabs(parsed.data.sheetId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });

  // The guessed mapping ships with the tab list so the wizard can prefill
  // the mapping step without a second round trip.
  return NextResponse.json({
    sheetName: result.sheetName,
    tabs: result.tabs.map((t) => ({ ...t, guessedMapping: guessColumnMapping(t.headers) })),
  });
}
