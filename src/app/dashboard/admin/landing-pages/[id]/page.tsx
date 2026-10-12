import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getLandingPage, listVersions } from "@/lib/data/landing-pages";
import { LandingEditor } from "@/components/admin/landing/LandingEditor";

export const metadata = { title: "Edit Landing Page — PZ Academy" };

export default async function LandingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const page = await getLandingPage(id);
  if (!page) notFound();
  const versions = await listVersions(id);
  // key={page.id}: switching to another page remounts the editor, so autosave state never leaks across pages.
  return <LandingEditor key={page.id} page={page} versions={versions} />;
}
