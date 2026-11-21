import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions, getPagePortalState } from "@/lib/data/landing-registration-admin";
import { getBatchGrid, getBatchWindow } from "@/lib/data/attendance";
import { getClassOverview } from "@/lib/data/class-overview";
import { listSessionSendState } from "@/lib/data/session-emails";
import { SessionsPanel } from "@/components/admin/attendance/SessionsPanel";

export const metadata = { title: "Classes — PZ Academy" };

// Marks and times change from this page: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/dashboard/admin/enrollments/registrations";

export default async function AdminSessionsPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage("classes");

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  if (!campaign) notFound();

  const now = new Date();
  const [overview, grid] = await Promise.all([getClassOverview(pageId, now), getBatchGrid(pageId, now)]);
  const sends = await listSessionSendState(grid.sessions.map((s) => s.id));
  const portal = await getPagePortalState(pageId);
  const batchWindow = await getBatchWindow(pageId);

  return (
    <div className="space-y-6 font-poppins">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-montserrat text-3xl font-extrabold tracking-tight text-[#0F3D22] dark:text-pz-on-surface">Classes</h1>
          <p className="text-base text-[#4D6B54] dark:text-pz-on-surface-variant">{campaign.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5">
          <Link
            href={`${BASE}/campaign/${pageId}/reports`}
            className="inline-flex min-h-12 items-center rounded-full text-base font-poppins font-semibold text-[#196432] hover:text-[#0F3D22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196432] focus-visible:ring-offset-2 dark:text-pz-primary dark:hover:text-pz-primary-fixed transition-colors"
          >
            Progress reports
          </Link>
          <Link
            href={`${BASE}/campaign/${pageId}/ids`}
            className="inline-flex min-h-12 items-center rounded-full text-base font-poppins font-semibold text-[#196432] hover:text-[#0F3D22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196432] focus-visible:ring-offset-2 dark:text-pz-primary dark:hover:text-pz-primary-fixed transition-colors"
          >
            Student IDs
          </Link>
          <Link
            href={`${BASE}/campaign/${pageId}`}
            className="inline-flex min-h-12 items-center rounded-full text-base font-poppins font-semibold text-[#196432] hover:text-[#0F3D22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196432] focus-visible:ring-offset-2 dark:text-pz-primary dark:hover:text-pz-primary-fixed transition-colors"
          >
            Back to registrations
          </Link>
        </div>
      </div>
      <SessionsPanel
        pageId={pageId}
        overview={overview}
        sessions={grid.sessions}
        rows={grid.rows}
        minPct={grid.minPct}
        sends={sends}
        pageStatus={portal?.status ?? "draft"}
        showInPortal={portal?.showInPortal ?? null}
        nowIso={now.toISOString()}
        batchWindow={batchWindow}
      />
    </div>
  );
}
