// src/lib/data/landing-course-modules.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * The module ids of the page's course. null = the page has no course; undefined = no such page.
 * Throws on a database error so a blip is never mistaken for "no modules".
 */
export async function getPageCourseModuleIds(pageId: string): Promise<string[] | null | undefined> {
  const admin = createAdminSupabase();
  const { data: page, error } = await admin.from("landing_pages").select("course_id").eq("id", pageId).maybeSingle();
  if (error) throw error;
  if (!page) return undefined;
  if (!page.course_id) return null;
  const { data: mods, error: modErr } = await admin.from("modules").select("id").eq("course_id", page.course_id);
  if (modErr) throw modErr;
  return (mods ?? []).map((m) => m.id);
}

export type CourseModule = { id: string; title: string; order_index: number };

/** The page's course modules in course order. null = the page has no course (or no such page). Throws on a database error. */
export async function getPageCourseModules(pageId: string): Promise<CourseModule[] | null> {
  const admin = createAdminSupabase();
  const { data: page, error } = await admin.from("landing_pages").select("course_id").eq("id", pageId).maybeSingle();
  if (error) throw error;
  if (!page?.course_id) return null;
  const { data: mods, error: modErr } = await admin.from("modules").select("id, title, order_index").eq("course_id", page.course_id).order("order_index", { ascending: true });
  if (modErr) throw modErr;
  return (mods ?? []).map((m) => ({ id: m.id, title: m.title, order_index: m.order_index }));
}
