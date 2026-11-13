import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MOTIVATION_MAX_IDS, listMotivationCandidates, sendMotivationBatch } from "@/lib/data/affiliate-motivation";

export const dynamic = "force-dynamic";

/** The zero-sale affiliates for the Motivation list. `?includeSent=1` also shows those who already got it. */
export async function GET(req: Request) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const includeSent = new URL(req.url).searchParams.get("includeSent") === "1";
  try {
    return NextResponse.json({ candidates: await listMotivationCandidates(includeSent) });
  } catch {
    return NextResponse.json({ error: "Could not load the list. Please try again." }, { status: 500 });
  }
}

/** Sends the Motivation email to up to 25 picked affiliates. The screen calls this in chunks. */
export async function POST(req: Request) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { ids, includeSent } = (body ?? {}) as { ids?: unknown; includeSent?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (ids.length > MOTIVATION_MAX_IDS) {
    return NextResponse.json({ error: `At most ${MOTIVATION_MAX_IDS} people per send.` }, { status: 400 });
  }
  if (includeSent !== undefined && typeof includeSent !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    return NextResponse.json(await sendMotivationBatch(ids as string[], { includeSent: includeSent === true }));
  } catch {
    return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 });
  }
}
