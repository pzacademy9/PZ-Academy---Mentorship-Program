import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAudienceFilter } from "@/lib/crm/audience-filter";
import { createSavedAudience, listSavedAudiences } from "@/lib/data/audience-saved";
import { firstPlainMessage, savedAudienceRenameSchema } from "@/lib/validations/audience";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET() {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listSavedAudiences());
  } catch (e) {
    console.error("[audiences] saved list failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Give the audience a name.", 400);
  }
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = savedAudienceRenameSchema.safeParse({ name: obj.name });
  if (!name.success) return err(firstPlainMessage(name.error, "Give the audience a name."), 400);
  const filter = parseAudienceFilter(obj.filter);
  if (!filter.ok) return err(filter.error, 400);

  try {
    const r = await createSavedAudience({ name: name.data.name, filter: filter.filter, adminId: auth.user.id });
    if (!r.ok) {
      return r.reason === "duplicate"
        ? err("A saved audience with this name already exists.", 409)
        : err("Saving needs one update first. Ask for it to be set up, then try again.", 409);
    }
    return NextResponse.json({ item: r.item });
  } catch (e) {
    console.error("[audiences] saved create failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}
