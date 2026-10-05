import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { salesAgentInviteSchema } from "@/lib/validations/sales-agent";
import { inviteOrCheckSalesAgent, confirmPromoteToSalesAgent } from "@/lib/data/sales-agents";

/** Step 1: new email -> sends the invite. Already-registered email -> returns "existing" without writing (see PUT). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = salesAgentInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name and a valid email." }, { status: 400 });
  }

  const result = await inviteOrCheckSalesAgent(
    parsed.data.email,
    parsed.data.fullName,
    `${req.nextUrl.origin}/reset-password`,
  );
  if (result.status === "error") {
    if (result.reason === "invite-failed") {
      return NextResponse.json({ error: "Could not send invite. Check the email address." }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }
  return NextResponse.json(result);
}

/** Step 2: the admin confirmed the "already has an account" dialog. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = salesAgentInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name and a valid email." }, { status: 400 });
  }

  const result = await confirmPromoteToSalesAgent(parsed.data.email);
  if (!result.ok) {
    const messages: Record<typeof result.reason, [string, number]> = {
      "account-not-found": ["That account no longer exists", 404],
      "already-sales-agent": ["That account is already a sales agent", 409],
      "is-admin": ["That account is an admin and cannot be made a sales agent", 409],
      "is-mentor": ["That account is a mentor. A mentor cannot also be a sales agent", 409],
      "db-error": ["Could not save changes", 500],
    };
    const [error, status] = messages[result.reason];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true });
}
