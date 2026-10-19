// src/app/api/admin/landing-pages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { saveDraft } from "@/lib/data/landing-pages";
import { getPageCourseModuleIds } from "@/lib/data/landing-course-modules";
import { normalizeContent } from "@/lib/landing/content";
import { saveDraftSchema, MAX_CONTENT_BYTES, isPageId } from "@/lib/validations/landing";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const text = await req.text().catch(() => "");
  // The cap is in bytes (what the network and the database carry), not UTF-16 characters:
  // Urdu, Arabic or emoji text is 2-4 bytes per character.
  if (new TextEncoder().encode(text).length > MAX_CONTENT_BYTES) {
    return NextResponse.json({ error: "This page has too much content to save." }, { status: 413 });
  }
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* falls through to 400 */ }

  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const content = normalizeContent(parsed.data.content);
  // Module links must point at modules of this page's course; only look them up when some are set.
  const linked = content.registration.options.flatMap((o) => o.moduleIds);
  if (linked.length > 0) {
    let courseModules: string[] | null | undefined;
    try { courseModules = await getPageCourseModuleIds(id); } catch { return NextResponse.json({ error: "Could not save changes" }, { status: 500 }); }
    if (courseModules === undefined) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const allowed = new Set(courseModules ?? []);
    if (linked.some((m) => !allowed.has(m))) {
      return NextResponse.json({ error: "Pick modules from this page's course." }, { status: 400 });
    }
  }

  const result = await saveDraft(id, content, parsed.data.baseRevision);
  if (!result.ok) {
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "Someone else changed this page. Reload to see their changes.", code: "conflict" },
        { status: 409 },
      );
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }
  return NextResponse.json({ revision: result.revision });
}
