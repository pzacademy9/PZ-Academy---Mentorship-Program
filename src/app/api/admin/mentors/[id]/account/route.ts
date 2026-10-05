import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { mentorInviteEmailSchema } from "@/lib/validations/mentor-account";
import {
  inviteOrCheckMentorAccount,
  confirmLinkExistingAccount,
  unlinkMentorAccount,
} from "@/lib/data/mentor-accounts";

/** Step 1 of invite: new email -> sends the invite. Already-registered email -> returns "existing" without writing (see PUT). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mentorInviteEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const result = await inviteOrCheckMentorAccount(id, parsed.data.email, `${req.nextUrl.origin}/reset-password`);
  if (result.status === "error") {
    if (result.reason === "mentor-not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    if (result.reason === "invite-failed") {
      return NextResponse.json({ error: "Could not send invite — check the email address." }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json(result);
}

/** Step 2 of invite: admin confirmed the "this email already has an account" dialog — actually promote + link. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mentorInviteEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const result = await confirmLinkExistingAccount(id, parsed.data.email);
  if (!result.ok) {
    if (result.reason === "mentor-not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    if (result.reason === "account-not-found") {
      return NextResponse.json({ error: "That account no longer exists" }, { status: 404 });
    }
    if (result.reason === "is-sales-agent") {
      return NextResponse.json(
        { error: "That account is a sales agent. A sales agent cannot also be a mentor" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not link account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Clears the link and reverts the account to role='student' — see unlinkMentorAccount's comment. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await unlinkMentorAccount(id);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not unlink account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
