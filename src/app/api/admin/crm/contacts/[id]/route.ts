import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getContactDetail, updateContactPhone } from "@/lib/data/admin-crm-contacts";
import { contactPhoneUpdateSchema } from "@/lib/validations/crm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = contactPhoneUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await updateContactPhone(id, parsed.data.phoneRaw);
  if (!result.ok) {
    if (result.reason === "invalid") {
      return NextResponse.json({ error: "Could not recognize this number. Include the country code, e.g. +63 917 591 8807." }, { status: 400 });
    }
    if (result.reason === "conflict") {
      const owner = result.ownerName ? ` (already used by ${result.ownerName})` : "";
      return NextResponse.json({ error: `This number belongs to another contact${owner}.` }, { status: 409 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save this number." }, { status: 500 });
  }

  return NextResponse.json({ phoneE164: result.phoneE164 });
}
