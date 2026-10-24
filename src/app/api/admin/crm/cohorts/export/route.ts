import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadCohortAudience } from "@/lib/data/cohort-export";
import { buildMetaRows, toMetaCsv, buildPlainRows, toPlainCsv, metaCsvFilename } from "@/lib/crm/meta-audience";

const MAX_IDS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => UUID.test(id))) {
    return NextResponse.json({ error: `Provide 1 to ${MAX_IDS} valid cohort ids.` }, { status: 400 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format !== null && format !== "plain") {
    return NextResponse.json({ error: "Unknown format." }, { status: 400 });
  }
  const plain = format === "plain";

  try {
    const { contacts, names } = await loadCohortAudience(ids);
    if (names.length === 0) {
      return NextResponse.json({ error: "Cohort not found." }, { status: 404 });
    }
    const csv = plain
      ? toPlainCsv(buildPlainRows(contacts).rows)
      : toMetaCsv(buildMetaRows(contacts).rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${metaCsvFilename(names, new Date(), plain ? "plain" : "hashed")}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[cohort-export] failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
