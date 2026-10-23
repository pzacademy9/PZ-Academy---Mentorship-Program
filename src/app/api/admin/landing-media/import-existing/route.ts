// src/app/api/admin/landing-media/import-existing/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { importExistingMedia } from "@/lib/data/landing-media";

export const maxDuration = 60;

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const result = await importExistingMedia(auth.user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Could not add the existing pictures. Please try again." },
      { status: 500 },
    );
  }
}
