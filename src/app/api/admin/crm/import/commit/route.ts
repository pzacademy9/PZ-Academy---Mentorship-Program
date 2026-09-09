import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { commitImport } from "@/lib/data/admin-crm-import";
import { rebuildMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { importCommitSchema } from "@/lib/validations/crm";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = importCommitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await commitImport(auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });

  // Rescan for probable duplicates now that new rows exist. A failure here
  // must not fail the import — the rows are already committed, and the queue
  // can be rebuilt from the Merge Review tab at any time.
  let mergeCandidates = 0;
  try {
    mergeCandidates = await rebuildMergeCandidates();
  } catch (error) {
    console.error("[crm-import] merge candidate rebuild failed:", error);
  }

  return NextResponse.json({ ...result, mergeCandidates }, { status: 201 });
}
