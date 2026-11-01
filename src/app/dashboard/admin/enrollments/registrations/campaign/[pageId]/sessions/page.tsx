import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions, getPagePortalState } from "@/lib/data/landing-registration-admin";
import { getBatchGrid } from "@/lib/data/attendance";
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
  await requireAdminPage();

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  if (!campaign) notFound();

  const now = new Date();
  const [overview, grid] = await Promise.all([getClassOverview(pageId, now), getBatchGrid(pageId, now)]);
  const sends = await listSessionSendState(grid.sessions.map((s) => s.id));
  const portal = await getPagePortalState(pageId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Classes</h1>
          <p className="text-base text-pz-on-surface-variant">{campaign.title}</p>
        </div>
        <Link
          href={`${BASE}/campaign/${pageId}`}
          className="inline-flex min-h-12 items-center text-base font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
        >
          Back to registrations
        </Link>
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
      />
    </div>
  );
}
