import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { audienceFacets } from "@/lib/data/audience-query";

export const maxDuration = 60;

export async function GET() {
  const auth = await requireAdmin(["sales_hub", "crm"]);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await audienceFacets());
  } catch (e) {
    console.error("[audiences] facets failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
