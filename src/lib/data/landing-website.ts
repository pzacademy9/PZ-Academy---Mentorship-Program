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

const ROW_CAP = 1000;
interface PageRow { id: string; course_id: string | null; slug: string; title: string; status: string; published: unknown }

/** Three batched reads; never throws (the website must still render without batches). */
export async function getOpenLiveBatches(): Promise<Map<string, OpenLiveBatch>> {
  const out = new Map<string, OpenLiveBatch>();
  try {
    const admin = createAdminSupabase();
    const { data: pagesData, error: pErr } = await admin
      .from("landing_pages").select("id, course_id, slug, title, status, published").eq("is_main_page", true).eq("status", "published");
    if (pErr) throw new Error(pErr.message);
    // Cheap checks first, so the later reads only cover candidate pages.
    const candidates = ((pagesData ?? []) as PageRow[])
      .filter((p) => p.course_id && p.published)
      .map((p) => ({ p, content: normalizeContent(p.published) }))
      .filter(({ content }) => content.registration.enabled && content.registration.modes.includes("live"));
    if (candidates.length === 0) return out;
    const pageIds = candidates.map((c) => c.p.id);
    const courseIds = Array.from(new Set(candidates.map((c) => c.p.course_id as string)));

    // PostgREST caps a response at 1000 rows; a full response may be truncated, so do not guess.
    const { data: states, error: sErr } = await admin.from("landing_batch_state").select("page_id, module_id").in("page_id", pageIds);
    if (sErr) throw new Error(sErr.message);
    const { data: mods, error: mErr } = await admin.from("modules").select("id, course_id").in("course_id", courseIds);
    if (mErr) throw new Error(mErr.message);
    if ((states?.length ?? 0) >= ROW_CAP || (mods?.length ?? 0) >= ROW_CAP) throw new Error("read may be truncated at the row cap");

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

    const unfinished = candidates.filter(({ p }) => {
      const ids = modulesByCourse.get(p.course_id as string) ?? [];
      const done = finishedModules.get(p.id);
      return !(wholeCourse.has(p.id) || (ids.length > 0 && ids.every((id) => done?.has(id))));
    });
    // Capacity last: one exact head count per limited page (rows are never fetched, so no row cap applies).
    const taken = await Promise.all(unfinished.map(async ({ p, content }) => {
      if (content.registration.capacity === 0) return 0;
      const { count, error } = await admin
        .from("landing_registrations").select("id", { count: "exact", head: true }).eq("page_id", p.id).eq("is_test", false);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }));

    unfinished.forEach(({ p, content }, i) => {
      const courseId = p.course_id as string;
      const open = isBatchOpen({
        status: p.status,
        hasPublished: true,
        enabled: content.registration.enabled,
        modes: content.registration.modes,
        capacity: content.registration.capacity,
        taken: taken[i],
        finished: false,
      });
      if (!open || out.has(courseId)) return;
      out.set(courseId, {
        courseId,
        slug: p.slug,
        title: p.title,
        startsOn: formatStartsOn(content.settings.batchStartsOn ?? ""),
        href: `/e/${p.slug}?src=website`,
      });
    });
    return out;
  } catch (e) {
    console.warn("[landing-website] open batch read failed", e instanceof Error ? e.message : e);
    return new Map();
  }
}

export async function getOpenLiveBatch(courseId: string): Promise<OpenLiveBatch | null> {
  return (await getOpenLiveBatches()).get(courseId) ?? null;
}
