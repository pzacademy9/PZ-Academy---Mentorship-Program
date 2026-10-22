import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getLandingPage, listVersions } from "@/lib/data/landing-pages";
import { isPageId } from "@/lib/validations/landing";
import { listPaymentCountries } from "@/lib/data/landing-payment-countries";
import { getPageSheetInfo } from "@/lib/data/landing-event-sheet";
import { listVariants } from "@/lib/data/landing-variants";
import { getPageCourseModules } from "@/lib/data/landing-course-modules";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { LandingEditor } from "@/components/admin/landing/LandingEditor";

export const metadata = { title: "Edit Landing Page — PZ Academy" };

export default async function LandingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!isPageId(id)) notFound();
  const page = await getLandingPage(id);
  if (!page) notFound();
  const versions = await listVersions(id);
  // Only used to tell the Add country dialog which countries already have a central account list.
  // A failed read just shows the "add this country's accounts" note for every country.
  const centralRegionKeys = await listPaymentCountries()
    .then((cs) => cs.filter((c) => c.active && c.accounts.some((a) => a.active)).map((c) => c.regionKey))
    .catch(() => [] as string[]);
  // key={page.id}: switching to another page remounts the editor, so autosave state never leaks across pages.
  // A failed read only hides the sheet link; the create route refuses a second sheet (409) anyway.
  const sheet = await getPageSheetInfo(id).catch(() => null);
  // Country / module links. A failed read throws (error page) rather than editing as if there were none.
  const variants = await listVariants(id);
  // A failed read only hides the "Modules this option gives" row; the save route still checks every module.
  const courseModules = await getPageCourseModules(id).catch((e) => {
    console.error("Could not load course modules for page", id, e);
    return null;
  });
  // A failed read hides the course picker so a blank list cannot be saved as "No course".
  const { data: courseRows, error: coursesError } = await createAdminSupabase().from("courses").select("id, title").order("title");
  if (coursesError) console.error("Could not load courses for page", id, coursesError);
  const courses = coursesError ? null : ((courseRows ?? []) as { id: string; title: string }[]);
  return <LandingEditor key={page.id} page={page} versions={versions} centralRegionKeys={centralRegionKeys} sheetId={sheet?.sheetId ?? null} variants={variants} courseModules={courseModules} courses={courses} />;
}
