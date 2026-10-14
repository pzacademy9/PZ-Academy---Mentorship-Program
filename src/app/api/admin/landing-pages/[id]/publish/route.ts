// src/app/api/admin/landing-pages/[id]/publish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { publishLandingPage } from "@/lib/data/landing-pages";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const result = await publishLandingPage(auth.user.id, id);
  if (!result.ok) {
    if (result.reason === "not-ready") {
      return NextResponse.json({ error: "The page is not ready to publish yet.", problems: result.problems }, { status: 422 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "This page changed while it was being published. Check your latest edits and publish again.", code: "conflict" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not publish" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, version: result.version });
}
