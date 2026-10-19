import { requireAdminPage } from "@/lib/auth/require-admin";
import {
  listRegistrations,
  listRegistrationPageOptions,
  listRegistrationAgentOptions,
  type RegistrationListFilters,
} from "@/lib/data/landing-registration-admin";
import Link from "next/link";
import { EnrollmentSourceTabs } from "@/components/admin/registrations/EnrollmentSourceTabs";
import { RegistrationFilters } from "@/components/admin/registrations/RegistrationFilters";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";

export const metadata = { title: "Page Registrations — PZ Academy" };

// Payment status changes from a dialog on these pages: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const STATUSES = ["pending", "reserved", "underpaid", "paid", "free"];
const BASE_PATH = "/dashboard/admin/enrollments/registrations";

type Params = { status?: string; mode?: string; pageId?: string; agentId?: string; q?: string; p?: string };

function parseFilters(sp: Params): RegistrationListFilters {
  const status = STATUSES.includes(sp.status ?? "")
    ? (sp.status as RegistrationListFilters["status"])
    : "all";
  const p = Math.floor(Number(sp.p));
  return {
    status,
    mode: sp.mode === "live" || sp.mode === "recorded" ? sp.mode : undefined,
    pageId: sp.pageId || undefined,
    agentId: sp.agentId || undefined,
    q: sp.q?.trim() || undefined,
    page: Number.isFinite(p) && p > 1 ? p : 1,
  };
}

export default async function AdminRegistrationsPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();

  const filters = parseFilters(await searchParams);
  const [list, pageOptions, agentOptions] = await Promise.all([
    listRegistrations({ kind: "all" }, filters),
    listRegistrationPageOptions(),
    listRegistrationAgentOptions(),
  ]);

  const query = {
    status: filters.status,
    mode: filters.mode,
    pageId: filters.pageId,
    agentId: filters.agentId,
    q: filters.q,
    p: filters.page,
  };

  return (
    <div className="space-y-6">
      <EnrollmentSourceTabs active="page" />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">Registrations</h1>
          <p className="font-body text-pz-on-surface-variant text-sm mt-1">
            Review sign-ups that came in through your landing pages and confirm their payment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/enrollments/registrations/access"
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface hover:bg-pz-surface-variant transition-colors"
          >
            Batch access
          </Link>
          <div className="flex flex-col px-3 py-2 rounded-lg bg-pz-surface-container-lowest border border-pz-outline-variant/40">
            <span className="text-[10px] font-label text-pz-on-surface-variant uppercase font-semibold">Paid</span>
            <span className="text-sm font-headline font-bold text-pz-on-surface tabular-nums">
              {list.counts.paid} / {list.counts.all}
            </span>
          </div>
        </div>
      </div>

      <RegistrationFilters
        basePath={BASE_PATH}
        filters={query}
        counts={list.counts}
        pageOptions={pageOptions}
        agentOptions={agentOptions}
      />

      <RegistrationsTable
        rows={list.rows}
        total={list.total}
        pageSize={list.pageSize}
        basePath={BASE_PATH}
        filters={query}
        detailHrefBase={BASE_PATH}
        showAgentColumn
      />
    </div>
  );
}
