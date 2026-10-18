// src/app/api/admin/landing-whatsapp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listWhatsappNumbers, addWhatsappNumber } from "@/lib/data/landing-whatsapp";
import { cleanWhatsappNumber } from "@/lib/landing/whatsapp";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ numbers: await listWhatsappNumbers() });
  } catch {
    return NextResponse.json({ error: "Could not load the WhatsApp numbers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as { label?: unknown; number?: unknown } | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (label.length < 1 || label.length > 60) {
    return NextResponse.json({ error: "Give the number a name of 1 to 60 characters." }, { status: 400 });
  }
  const number = typeof body?.number === "string" ? cleanWhatsappNumber(body.number) : null;
  if (!number) {
    return NextResponse.json({ error: "Enter the number with its country code, 8 to 15 digits." }, { status: 400 });
  }

  const result = await addWhatsappNumber({ label, number }, auth.user.id);
  if (!result.ok) {
    if (result.reason === "duplicate") return NextResponse.json({ error: "That number is already in the list." }, { status: 409 });
    if (result.reason === "invalid") return NextResponse.json({ error: "That number or name is not valid." }, { status: 400 });
    return NextResponse.json({ error: "Could not save the number" }, { status: 500 });
  }
  return NextResponse.json({ number: result.row }, { status: 201 });
}
