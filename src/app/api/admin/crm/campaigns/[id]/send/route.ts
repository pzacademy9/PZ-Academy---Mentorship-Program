import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendCampaign } from "@/lib/data/admin-crm-campaigns";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await sendCampaign(id);

  if (!result.ok) {
    const message =
      result.reason === "empty-segment"
        ? "That segment matches nobody who can be emailed."
        : result.reason === "already-sent"
          ? "This campaign has already been sent."
          : result.reason === "cancelled"
            ? "This campaign was cancelled and cannot be sent."
            : result.reason === "not-found"
              ? "Campaign not found."
              : "Could not send this campaign.";
    const status = result.reason === "not-found" ? 404 : result.reason === "db-error" ? 500 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
