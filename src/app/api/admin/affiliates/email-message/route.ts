import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { MESSAGE_MAX, setEmailMessage } from "@/lib/data/affiliate-email-settings";

export const dynamic = "force-dynamic";

/** Saves the message shown in the affiliate Accepted and Progress emails. */
export async function PUT(req: Request) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (message.trim().length > MESSAGE_MAX) {
    return NextResponse.json({ error: `The message can be at most ${MESSAGE_MAX} characters.` }, { status: 400 });
  }
  try {
    await setEmailMessage(message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the message. Please try again." }, { status: 500 });
  }
}
