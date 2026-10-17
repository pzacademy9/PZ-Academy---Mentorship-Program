// src/app/api/admin/landing-pages/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { importLandingPage } from "@/lib/data/landing-import";

export const maxDuration = 60;

const MAX_CHARS = 400_000;
// 400,000 characters can be up to 4 bytes each in UTF-8, plus the JSON wrapper.
const MAX_BODY_BYTES = MAX_CHARS * 4 + 1_000;
const TOO_BIG = { errors: ["That file is too big to import."] };

const bodySchema = z.object({ markdown: z.string().min(1).max(MAX_CHARS) });

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return NextResponse.json(TOO_BIG, { status: 400 });
  const rawBody = await req.text().catch(() => "");
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json(TOO_BIG, { status: 400 });
  let json: unknown = null;
  try { json = JSON.parse(rawBody); } catch { json = null; }
  if (json && typeof json === "object" && typeof (json as { markdown?: unknown }).markdown === "string"
      && (json as { markdown: string }).markdown.length > MAX_CHARS) {
    return NextResponse.json(TOO_BIG, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
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
