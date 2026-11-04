import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/require-admin";
import { teamAccessSchema } from "@/lib/validations/team";
import { saveTeamMember, switchOffTeamMember } from "@/lib/data/team-access";
import { teamFailure } from "@/lib/team/messages";

type Ctx = { params: Promise<{ id: string }> };

/** Change a person's role and custom areas (also brings back a switched-off person). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = teamAccessSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a role and valid areas." }, { status: 400 });

  const saved = await saveTeamMember({ userId: id, role: parsed.data.role, custom: { extra: parsed.data.extra, removed: parsed.data.removed } });
  if (!saved.ok) {
    const f = teamFailure(saved.reason);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  return NextResponse.json({ ok: true });
}

/** Switch a person off: they become a plain student; their custom areas are kept. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const result = await switchOffTeamMember(id);
  if (!result.ok) {
    const f = teamFailure(result.reason);
    return NextResponse.json({ error: f.error }, { status: f.status });
  }
  return NextResponse.json({ ok: true });
}
