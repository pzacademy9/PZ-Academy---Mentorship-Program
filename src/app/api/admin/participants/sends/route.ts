import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createSend, listSends } from "@/lib/data/participant-sends";
import { createSendBodySchema, isUuid } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = createSendBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await createSend({ ...parsed.data, actorId: auth.user.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code, summary: result.summary }, { status: 409 });
    }
    return NextResponse.json({ sendId: result.sendId, count: result.count }, { status: 201 });
  } catch (e) {
    console.error("participants createSend failed", e);
    return NextResponse.json({ error: "Could not create the send" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const pageId = new URL(req.url).searchParams.get("pageId") ?? "";
  if (!isUuid(pageId)) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    return NextResponse.json({ sends: await listSends(pageId) });
  } catch (e) {
    console.error("participants listSends failed", e);
    return NextResponse.json({ error: "Could not load sends" }, { status: 500 });
  }
}
