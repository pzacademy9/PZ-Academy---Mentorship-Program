import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeContent } from "@/lib/landing/content";
import { formatStartsOn } from "@/lib/emails/landing-registration";

/** An open Live batch a course can advertise on the public website. */
export type OpenLiveBatch = { courseId: string; slug: string; title: string; startsOn: string; href: string };

export function isBatchOpen(a: {
  status: string; hasPublished: boolean; enabled: boolean; modes: string[]; capacity: number; taken: number; finished: boolean;
}): boolean {
  if (a.status !== "published" || !a.hasPublished || !a.enabled || !a.modes.includes("live") || a.finished) return false;
  return a.capacity === 0 || a.taken < a.capacity;
}

interface PageRow { id: string; course_id: string | null; slug: string; title: string; status: string; published: unknown }

/** Three batched reads; never throws (the website must still render without batches). */
export async function getOpenLiveBatches(): Promise<Map<string, OpenLiveBatch>> {
  const out = new Map<string, OpenLiveBatch>();
  try {
    const admin = createAdminSupabase();
    const { data: pagesData, error: pErr } = await admin
      .from("landing_pages").select("id, course_id, slug, title, status, published").eq("is_main_page", true);
    if (pErr) throw new Error(pErr.message);
    const pages = ((pagesData ?? []) as PageRow[]).filter((p) => p.course_id && p.published);
    if (pages.length === 0) return out;
    const pageIds = pages.map((p) => p.id);
    const courseIds = Array.from(new Set(pages.map((p) => p.course_id as string)));

    const { data: regs, error: rErr } = await admin
      .from("landing_registrations").select("page_id").in("page_id", pageIds).eq("is_test", false);
    if (rErr) throw new Error(rErr.message);
    const taken = new Map<string, number>();
    for (const r of regs ?? []) taken.set(r.page_id, (taken.get(r.page_id) ?? 0) + 1);

    const { data: states, error: sErr } = await admin.from("landing_batch_state").select("page_id, module_id").in("page_id", pageIds);
    if (sErr) throw new Error(sErr.message);
    const { data: mods, error: mErr } = await admin.from("modules").select("id, course_id").in("course_id", courseIds);
    if (mErr) throw new Error(mErr.message);

    const wholeCourse = new Set<string>();
    const finishedModules = new Map<string, Set<string>>();
    for (const s of states ?? []) {
      if (s.module_id === null) wholeCourse.add(s.page_id);
      else {
        if (!finishedModules.has(s.page_id)) finishedModules.set(s.page_id, new Set());
        finishedModules.get(s.page_id)!.add(s.module_id);
      }
    }
    const modulesByCourse = new Map<string, string[]>();
    for (const m of mods ?? []) {
      if (!modulesByCourse.has(m.course_id)) modulesByCourse.set(m.course_id, []);
      modulesByCourse.get(m.course_id)!.push(m.id);
    }

    for (const p of pages) {
      const courseId = p.course_id as string;
      const content = normalizeContent(p.published);
      const ids = modulesByCourse.get(courseId) ?? [];
      const done = finishedModules.get(p.id);
      const finished = wholeCourse.has(p.id) || (ids.length > 0 && ids.every((id) => done?.has(id)));
      const open = isBatchOpen({
        status: p.status,
        hasPublished: true,
        enabled: content.registration.enabled,
        modes: content.registration.modes,
        capacity: content.registration.capacity,
        taken: taken.get(p.id) ?? 0,
        finished,
      });
      if (!open || out.has(courseId)) continue;
      out.set(courseId, {
        courseId,
        slug: p.slug,
        title: p.title,
        startsOn: formatStartsOn(content.settings.batchStartsOn ?? ""),
        href: `/e/${p.slug}?src=website`,
      });
    }
    return out;
  } catch (e) {
    console.warn("[landing-website] open batch read failed", e instanceof Error ? e.message : e);
    return new Map();
  }
}

export async function getOpenLiveBatch(courseId: string): Promise<OpenLiveBatch | null> {
  return (await getOpenLiveBatches()).get(courseId) ?? null;
}
