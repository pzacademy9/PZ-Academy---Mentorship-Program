import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createNumber, listNumbersAdmin } from "@/lib/data/sales-numbers";
import { numberCreateSchema } from "@/lib/validations/sales";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const result = await listNumbersAdmin();
  if (!result.ok) return NextResponse.json({ error: "Could not load numbers." }, { status: 500 });
  return NextResponse.json({ numbers: result.numbers });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = numberCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await createNumber(parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not add this number." }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
