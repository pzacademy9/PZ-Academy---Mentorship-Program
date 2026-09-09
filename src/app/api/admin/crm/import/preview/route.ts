import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { previewImport } from "@/lib/data/admin-crm-import";
import { importPreviewSchema } from "@/lib/validations/crm";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = importPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await previewImport(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });

  return NextResponse.json(result.preview);
}
