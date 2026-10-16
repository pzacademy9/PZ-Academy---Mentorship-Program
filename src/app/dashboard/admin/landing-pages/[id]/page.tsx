import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getLandingPage, listVersions } from "@/lib/data/landing-pages";
import { isPageId } from "@/lib/validations/landing";
import { listPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import { getPageSheetInfo } from "@/lib/data/landing-event-sheet";
import { listVariants } from "@/lib/data/landing-variants";
import { LandingEditor } from "@/components/admin/landing/LandingEditor";

export const metadata = { title: "Edit Landing Page — PZ Academy" };

export default async function LandingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!isPageId(id)) notFound();
  const page = await getLandingPage(id);
  if (!page) notFound();
  const versions = await listVersions(id);
  const accounts = (await listPaymentAccounts()).map(({ key, label, kind, displayText }) => ({ key, label, kind, displayText }));
  // key={page.id}: switching to another page remounts the editor, so autosave state never leaks across pages.
  // A failed read only hides the sheet link; the create route refuses a second sheet (409) anyway.
  const sheet = await getPageSheetInfo(id).catch(() => null);
  // Country / module links. A failed read throws (error page) rather than editing as if there were none.
  const variants = await listVariants(id);
  return <LandingEditor key={page.id} page={page} versions={versions} accounts={accounts} sheetId={sheet?.sheetId ?? null} variants={variants} />;
}
