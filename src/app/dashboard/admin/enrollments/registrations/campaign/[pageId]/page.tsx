import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrations, listRegistrationPageOptions, type RegistrationListFilters } from "@/lib/data/landing-registration-admin";
import { listCampaignFilterOptions } from "@/lib/data/participant-campaigns";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { CampaignRegistrations } from "@/components/admin/registrations/CampaignRegistrations";

export const metadata = { title: "Campaign Registrations — PZ Academy" };

// Payment status changes from a dialog on these pages: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STATUSES = ["pending", "reserved", "underpaid", "paid", "free"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_BASE = "/dashboard/admin/enrollments/registrations";

type Params = { status?: string; mode?: string; q?: string; region?: string; optionLabel?: string; p?: string };

export default async function AdminCampaignRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<Params>;
}) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();

  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  if (!campaign) notFound();

  const sp = await searchParams;
  const p = Math.floor(Number(sp.p));
  const filters: RegistrationListFilters = {
    pageId,
    status: STATUSES.includes(sp.status ?? "") ? (sp.status as RegistrationListFilters["status"]) : "all",
    mode: sp.mode === "live" || sp.mode === "recorded" ? sp.mode : undefined,
    q: sp.q?.trim() || undefined,
    region: sp.region || undefined,
    optionLabel: sp.optionLabel || undefined,
    page: Number.isFinite(p) && p > 1 ? p : 1,
  };

  const [list, filterOptions] = await Promise.all([
    listRegistrations({ kind: "all" }, filters),
    listCampaignFilterOptions(pageId),
  ]);

  const query = {
    status: filters.status,
    mode: filters.mode,
    q: filters.q,
    region: filters.region,
    optionLabel: filters.optionLabel,
    p: filters.page,
  };
  // What "select everyone in this filter" stores: the filters without the page number.
  const selectionFilters: RegistrationListFilters = { ...filters };
  delete selectionFilters.page;

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />
      <CampaignRegistrations
        // A new page of results or a new filter starts with nothing ticked.
        key={JSON.stringify(query)}
        pageId={pageId}
        pageTitle={campaign.title}
        rows={list.rows}
        total={list.total}
        pageSize={list.pageSize}
        counts={list.counts}
        basePath={`${DETAIL_BASE}/campaign/${pageId}`}
        detailHrefBase={DETAIL_BASE}
        filters={selectionFilters}
        query={query}
        filterOptions={filterOptions}
      />
    </div>
  );
}
