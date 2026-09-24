import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listTemplates, createTemplate, type TemplateChannel } from "@/lib/data/admin-crm-templates";
import { templateCreateSchema } from "@/lib/validations/crm";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const channel = req.nextUrl.searchParams.get("channel");
  if (channel !== "email" && channel !== "whatsapp") {
    return NextResponse.json({ error: "channel must be email or whatsapp" }, { status: 400 });
  }

  return NextResponse.json({ templates: await listTemplates(channel as TemplateChannel) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = templateCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await createTemplate(auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not save this template." }, { status: 500 });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
