import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-admin";
import { teamMemberSchema } from "@/lib/validations/team";
import { findTeamCandidateId, inviteOrCheckTeamMember, listTeam, saveTeamMember } from "@/lib/data/team-access";
import { teamFailure } from "@/lib/team/messages";

/** Super admin only: the whole team screen is behind this check. */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ members: await listTeam() });
}

/** Step 1: new email -> invite and save the role. Existing account -> "existing" without writing (see PUT). */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const parsed = teamMemberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, a valid email, a role and valid areas." }, { status: 400 });
  const { email, fullName, role, extra, removed } = parsed.data;

  const result = await inviteOrCheckTeamMember(email, fullName, `${req.nextUrl.origin}/reset-password`);
  if (result.status === "error") {
    return NextResponse.json(
      { error: result.reason === "invite-failed" ? "Could not send invite. Check the email address." : "Could not save changes." },
      { status: result.reason === "invite-failed" ? 422 : 500 },
    );
  }
  if (result.status === "existing") return NextResponse.json({ status: "existing", email });

  const saved = await saveTeamMember({ userId: result.userId, role, custom: { extra, removed } });
  if (!saved.ok) {
    const f = teamFailure(saved.reason);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  return NextResponse.json({ status: "invited", email });
}

/** Step 2: the super admin confirmed "this email already has an account". */
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const parsed = teamMemberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name, a valid email, a role and valid areas." }, { status: 400 });
  const { email, role, extra, removed } = parsed.data;

  const userId = await findTeamCandidateId(email);
  if (!userId) {
    const f = teamFailure("not-found");
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  const saved = await saveTeamMember({ userId, role, custom: { extra, removed } });
  if (!saved.ok) {
    const f = teamFailure(saved.reason);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  return NextResponse.json({ ok: true });
}
