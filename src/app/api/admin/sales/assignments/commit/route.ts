import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { commitAssignment } from "@/lib/data/sales-assignment";
import { bulkAssignSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = bulkAssignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await commitAssignment(
    { id: auth.user.id, role: "admin" },
    parsed.data.source,
    parsed.data.agentId,
    parsed.data.includeOwned,
  );
  if (!result.ok) {
    const error =
      result.reason === "invalid-agent"
        ? "That person is not a sales agent."
        : result.reason === "not-found"
          ? "No contacts found for that list."
          : "Could not assign these contacts.";
    return NextResponse.json(
      { error, reason: result.reason, ...(result.partial ? { partial: result.partial } : {}) },
      { status: statusForReason(result.reason) },
    );
  }
  return NextResponse.json({ result: result.result });
}
