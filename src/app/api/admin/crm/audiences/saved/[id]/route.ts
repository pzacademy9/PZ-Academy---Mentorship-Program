import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteSavedAudience, renameSavedAudience } from "@/lib/data/audience-saved";
import { UUID_RE, firstPlainMessage, savedAudienceRenameSchema } from "@/lib/validations/audience";

const err = (error: string, status: number) => NextResponse.json({ error }, { status });
const NEEDS_UPDATE = "Saved audiences need one update first. Ask for it to be set up, then try again.";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return err("This saved audience is not valid.", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Give the audience a name.", 400);
  }
  const parsed = savedAudienceRenameSchema.safeParse(body);
  if (!parsed.success) return err(firstPlainMessage(parsed.error, "Give the audience a name."), 400);

  try {
    const r = await renameSavedAudience({ id, name: parsed.data.name });
    if (!r.ok) {
      if (r.reason === "duplicate") return err("A saved audience with this name already exists.", 409);
      if (r.reason === "notFound") return err("This saved audience was not found.", 404);
      return err(NEEDS_UPDATE, 409);
    }
    return NextResponse.json({ item: r.item });
  } catch (e) {
    console.error("[audiences] saved rename failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) return err("This saved audience is not valid.", 400);
  try {
    const r = await deleteSavedAudience(id);
    if (!r.ok) return err(NEEDS_UPDATE, 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[audiences] saved delete failed", e instanceof Error ? e.name : "unknown");
    return err("Something went wrong. Please try again.", 500);
  }
}
