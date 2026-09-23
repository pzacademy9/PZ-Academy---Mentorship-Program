import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveSegment, resolveWhatsAppSegment } from "@/lib/data/admin-crm-segments";
import { segmentPreviewSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = segmentPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Logged server-side because a discriminated-union mismatch (e.g. a
    // stray field/op pair left over from an earlier filter default) reports
    // as Zod's generic "Invalid input" to the client with no indication of
    // which filter or field caused it.
    console.error("[crm-segments-preview] invalid segment:", JSON.stringify(parsed.error.issues));
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
    return NextResponse.json({ error: `Invalid segment${where}: ${first?.message ?? "unknown"}` }, { status: 400 });
  }

  if (parsed.data.channel === "whatsapp") {
    const result = await resolveWhatsAppSegment(parsed.data.segment, { limit: 10 });
    if (!result.ok) return NextResponse.json({ error: "Could not resolve that segment" }, { status: 500 });
    return NextResponse.json({
      total: result.total,
      samples: result.contacts.map((c) => ({ fullName: c.fullName, phoneE164: c.phoneE164 })),
    });
  }

  const result = await resolveSegment(parsed.data.segment, { limit: 10 });
  if (!result.ok) return NextResponse.json({ error: "Could not resolve that segment" }, { status: 500 });

  return NextResponse.json({
    total: result.total,
    samples: result.contacts.map((c) => ({ fullName: c.fullName, email: c.email })),
  });
}
