// src/app/api/admin/landing-pages/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { importLandingPage } from "@/lib/data/landing-import";

export const maxDuration = 60;

const bodySchema = z.object({ markdown: z.string().min(1).max(400_000) });

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ errors: ["Choose a file or paste the text first."] }, { status: 400 });
  }

  try {
    const result = await importLandingPage(auth.user.id, parsed.data.markdown);
    if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });
    const { pageId, slug, slugChanged, warnings, linksCreated, linksFailed } = result;
    return NextResponse.json({ pageId, slug, slugChanged, warnings, linksCreated, linksFailed }, { status: 201 });
  } catch {
    return NextResponse.json(
      { errors: ["Something went wrong while importing. Nothing was lost; please try again."] },
      { status: 500 },
    );
  }
}
