import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { getPageJobSummary } from "@/lib/data/landing-ops";

export const dynamic = "force-dynamic";

/** Unfinished Sheet-row and email jobs of one page, for the editor's Registrations card. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    const summary = await getPageJobSummary(id);
    if (!summary) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the background tasks." }, { status: 500 });
  }
}
