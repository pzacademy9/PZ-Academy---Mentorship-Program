// src/app/api/admin/landing-sheet-sync/install/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { installLandingScanTrigger } from "@/lib/gas/event-sheet-client";

export const maxDuration = 60;

/** Switches on the automatic sheet check (every 5 minutes) in Google Sheets. Safe to repeat. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await installLandingScanTrigger();
  if (!r.ok) return NextResponse.json({ error: `Could not switch on the automatic check: ${r.message ?? "no reply"}` }, { status: 502 });
  return NextResponse.json({ message: "The automatic check is on." });
}
