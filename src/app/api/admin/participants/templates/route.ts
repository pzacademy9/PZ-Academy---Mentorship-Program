import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listTemplates, saveTemplate } from "@/lib/data/participant-templates";
import { templateBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (e) {
    console.error("participants listTemplates failed", e);
    return NextResponse.json({ error: "Could not load templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = templateBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const template = await saveTemplate({ ...parsed.data, actorId: auth.user.id });
    return NextResponse.json({ template }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "Give the template a name") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("participants saveTemplate failed", e);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }
}
