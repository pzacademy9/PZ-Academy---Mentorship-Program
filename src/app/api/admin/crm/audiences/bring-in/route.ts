import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearAudienceCache } from "@/lib/data/audience-query";
import { closeBatch } from "@/lib/data/landing-close-batch";
import { BRING_IN_MAX_PAGES, bringInSchema, firstPlainMessage } from "@/lib/validations/audience";

export const maxDuration = 60;

type PageResult = { id: string; ok: boolean; paidAdded: number; interestedAdded: number; skipped: number; error?: string };

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pick at least one page." }, { status: 400 });
  }
  const parsed = bringInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstPlainMessage(parsed.error, "Pick at least one page.") }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.pageIds));
  if (ids.length > BRING_IN_MAX_PAGES) {
    return NextResponse.json({ error: `Pick ${BRING_IN_MAX_PAGES} pages at most.` }, { status: 400 });
  }

  // One page at a time; a page that fails never stops the rest.
  const pages: PageResult[] = [];
  try {
    for (const id of ids) {
      try {
        const r = await closeBatch({ pageId: id, adminId: auth.user.id });
        pages.push({ id, ok: true, paidAdded: r.paidAdded, interestedAdded: r.interestedAdded, skipped: r.skipped });
      } catch (e) {
        console.error("[audiences] bring-in failed", e instanceof Error ? e.name : "unknown");
        pages.push({
          id,
          ok: false,
          paidAdded: 0,
          interestedAdded: 0,
          skipped: 0,
          error: "Could not bring this page in. Please try again.",
        });
      }
    }
  } finally {
    // This only clears the cache of the server instance that handled this request; other instances keep
    // theirs for up to 60 seconds. The page compensates: its facets read and the count after Bring in
    // ask for fresh data. New people may have been added even if pages failed or the run was cut short.
    clearAudienceCache();
  }
  return NextResponse.json({ pages });
}
