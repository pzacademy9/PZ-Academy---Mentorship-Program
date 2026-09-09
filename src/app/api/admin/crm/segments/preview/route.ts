import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveSegment } from "@/lib/data/admin-crm-segments";
import { segmentPreviewSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = segmentPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });

  const { contacts, total } = await resolveSegment(parsed.data.segment, { limit: 10 });
  return NextResponse.json({
    total,
    samples: contacts.map((c) => ({ fullName: c.fullName, email: c.email })),
  });
}
