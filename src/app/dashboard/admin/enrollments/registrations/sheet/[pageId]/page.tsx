import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { getPageSheetInfo, getPageMirrorInfo } from "@/lib/data/landing-event-sheet";
import { getSheetSyncStatus } from "@/lib/data/landing-sheet-sync";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { SheetSyncPanel } from "@/components/admin/registrations/SheetSyncPanel";
import { MirrorPanel } from "@/components/admin/registrations/MirrorPanel";

export const metadata = { title: "Sheet sync — PZ Academy" };

// What the sheet check found changes on its own: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminSheetSyncPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Admin only: sales agents never reach this screen.
  await requireAdminPage();

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  if (!campaign) notFound();

  const info = await getPageSheetInfo(pageId);
  const hasSheet = Boolean(info?.sheetId);
  const status = hasSheet ? await getSheetSyncStatus(pageId) : null;

  const mirror = await getPageMirrorInfo(pageId);

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />
      <SheetSyncPanel pageId={pageId} pageTitle={campaign.title} hasSheet={hasSheet} status={status} />
      {mirror?.sheetId ? (
        <MirrorPanel pageId={pageId} lastRunAt={mirror.lastRunAt} lastResult={mirror.lastResult} />
      ) : null}
    </div>
  );
}
