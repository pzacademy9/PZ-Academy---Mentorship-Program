import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAudienceFilter } from "@/lib/crm/audience-filter";
import { countAudience } from "@/lib/data/audience-query";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The audience choices are not valid." }, { status: 400 });
  }
  const parsed = parseAudienceFilter(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const c = await countAudience(parsed.filter);
    return NextResponse.json({
      total: c.total,
      inFile: c.inFile,
      leftOut: { noContact: c.leftOut.noContact, doNotContact: c.leftOut.doNotContact },
      tooLarge: c.tooLarge,
      ignoredChoices: c.ignoredChoices,
      needsUpdate: c.needsUpdate,
      statusNeedsUpdate: c.statusNeedsUpdate,
    });
  } catch (e) {
    console.error("[audiences] count failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
