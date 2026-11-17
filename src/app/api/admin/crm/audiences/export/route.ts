import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { decodeAudienceFilter, describeAudienceFilter, parseAudienceFilter, type AudienceFilter } from "@/lib/crm/audience-filter";
import { buildMetaRows, toMetaCsv, buildPlainRows, toPlainCsv, metaCsvFilename } from "@/lib/crm/meta-audience";
import { loadAudienceFile } from "@/lib/data/audience-query";
import { getSavedAudience } from "@/lib/data/audience-saved";
import { UUID_RE } from "@/lib/validations/audience";

export const maxDuration = 60;

const NEEDS_UPDATE = "This needs one update first. Ask for it to be set up, then try again.";
const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const f = params.get("f");
  const saved = params.get("saved");
  const format = params.get("format");
  if (format !== null && format !== "plain") return err("Unknown format.", 400);
  const plain = format === "plain";
  if ((f === null) === (saved === null)) return err("Choose an audience to download.", 400);

  let filter: AudienceFilter;
  let nameLines: string[];
  try {
    if (saved !== null) {
      if (!UUID_RE.test(saved)) return err("This saved audience is not valid.", 400);
      const got = await getSavedAudience(saved);
      if (got.needsUpdate) return err(NEEDS_UPDATE, 409);
      if (!got.item) return err("This saved audience was not found.", 404);
      // The stored choices are checked again; old ones may no longer pass.
      const parsed = got.item.filter ? parseAudienceFilter(got.item.filter) : null;
      if (!parsed || !parsed.ok) return err("The choices saved with this audience are no longer valid.", 400);
      filter = parsed.filter;
      nameLines = [got.item.name];
    } else {
      const parsed = decodeAudienceFilter(f ?? "");
      if (!parsed.ok) return err(parsed.error, 400);
      filter = parsed.filter;
      nameLines = describeAudienceFilter(filter);
    }

    const file = await loadAudienceFile(filter);
    if (file.needsUpdate) return err(NEEDS_UPDATE, 409);
    if (file.tooLarge) return err("This is too many people for one file. Narrow the choices and try again.", 413);

    const built = plain ? buildPlainRows(file.contacts).rows : buildMetaRows(file.contacts).rows;
    if (built.length === 0) return err("Nobody to download for these choices.", 400);
    const csv = plain
      ? toPlainCsv(buildPlainRows(file.contacts).rows)
      : toMetaCsv(buildMetaRows(file.contacts).rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${metaCsvFilename(nameLines, new Date(), plain ? "plain" : "hashed")}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[audiences] export failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}
