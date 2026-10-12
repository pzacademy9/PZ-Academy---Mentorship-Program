// src/app/api/admin/landing-pages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createLandingPage } from "@/lib/data/landing-pages";
import { createPageSchema } from "@/lib/validations/landing";
import { emptyContent } from "@/lib/landing/content";
import { buildTemplate } from "@/lib/landing/templates";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = createPageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { title, slug, kind, templateId } = parsed.data;
  const content = (templateId && buildTemplate(templateId, kind)) || emptyContent(kind);

  const result = await createLandingPage(auth.user.id, { title, slug, kind, content });
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return NextResponse.json({ error: "A page with that link already exists. Please choose a different link." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create the page" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
