import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSafetySettings, updateSafetySettings } from "@/lib/data/sales-numbers";
import { settingsUpdateSchema } from "@/lib/validations/sales";

const LOAD_ERROR = { error: "Could not load the settings." };

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ settings: await getSafetySettings() });
  } catch {
    return NextResponse.json(LOAD_ERROR, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = settingsUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Cross-field rules (spacing, warning vs cap) must hold against the stored values too.
  let stored;
  try {
    stored = await getSafetySettings();
  } catch {
    return NextResponse.json(LOAD_ERROR, { status: 500 });
  }
  const merged = settingsUpdateSchema.safeParse({ ...stored, ...parsed.data });
  if (!merged.success) {
    return NextResponse.json({ error: merged.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await updateSafetySettings(parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not save the settings." }, { status: 500 });
  return NextResponse.json({ settings: result.settings });
}
