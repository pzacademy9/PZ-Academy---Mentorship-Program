import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAudienceFilter } from "@/lib/crm/audience-filter";
import { buildAudiencePreview } from "@/lib/crm/audience-preview";
import { loadAudienceFile } from "@/lib/data/audience-query";

export const maxDuration = 60;

const NEEDS_UPDATE = "This needs one update first. Ask for it to be set up, then try again.";
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("The audience choices are not valid.", 400);
  }
  const parsed = parseAudienceFilter(body);
  if (!parsed.ok) return err(parsed.error, 400);

  try {
    const file = await loadAudienceFile(parsed.filter);
    if (file.needsUpdate) return err(NEEDS_UPDATE, 409);
    // Never widen to everyone because every chosen course is gone.
    if (file.allCoursesGone) {
      return err("The courses chosen for this audience no longer exist. Choose the courses again.", 400);
    }
    if (file.tooLarge) return err("This is too many people for one file. Narrow the choices and try again.", 413);

    const preview = buildAudiencePreview(file.contacts, parsed.filter, new Date());
    return NextResponse.json(preview, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[audiences] preview failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}
