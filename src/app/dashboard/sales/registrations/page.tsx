import { Inbox } from "lucide-react";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import {
  listRegistrations,
  listRegistrationPageOptions,
  type RegistrationListFilters,
  type Scope,
} from "@/lib/data/landing-registration-admin";
import { EmptyState } from "@/components/ui/empty-state";
import { RegistrationFilters } from "@/components/admin/registrations/RegistrationFilters";
import { RegistrationsTable } from "@/components/admin/registrations/RegistrationsTable";

export const metadata = { title: "My Registrations — Sales Workspace" };

const STATUSES = ["pending", "reserved", "underpaid", "paid", "free"];
const BASE_PATH = "/dashboard/sales/registrations";

type Params = { status?: string; mode?: string; pageId?: string; q?: string; p?: string };

function parseFilters(sp: Params): RegistrationListFilters {
  const status = STATUSES.includes(sp.status ?? "")
    ? (sp.status as RegistrationListFilters["status"])
    : "all";
  const p = Math.floor(Number(sp.p));
  return {
    status,
    mode: sp.mode === "live" || sp.mode === "recorded" ? sp.mode : undefined,
    pageId: sp.pageId || undefined,
    q: sp.q?.trim() || undefined,
    page: Number.isFinite(p) && p > 1 ? p : 1,
  };
}

export default async function SalesRegistrationsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, role } = await requireSalesAgentPage();
  // Agents see only their own registrations (never test rows); admins who open this path see all.
  const scope: Scope = role === "sales_agent" ? { kind: "agent", agentId: user.id } : { kind: "all" };

  const filters = parseFilters(await searchParams);
  const [list, pageOptions] = await Promise.all([listRegistrations(scope, filters), listRegistrationPageOptions()]);

  const query = { status: filters.status, mode: filters.mode, pageId: filters.pageId, q: filters.q, p: filters.page };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Registrations</h1>
          <p className="font-body text-pz-on-surface-variant text-sm mt-1">
            People who signed up through your link. Open one to see the details or update the payment status.
          </p>
        </div>
        <div className="flex flex-col px-3 py-2 rounded-lg bg-pz-surface-container-lowest border border-pz-outline-variant/40">
          <span className="text-[10px] font-label text-pz-on-surface-variant uppercase font-semibold">Paid</span>
          <span className="text-sm font-headline font-bold text-pz-on-surface tabular-nums">
            {list.counts.paid} / {list.counts.all}
          </span>
        </div>
      </div>

      {list.counts.all === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No registrations yet"
          description="When someone registers through your link, they will show up here."
        />
      ) : (
        <>
          <RegistrationFilters basePath={BASE_PATH} filters={query} counts={list.counts} pageOptions={pageOptions} />
          <RegistrationsTable
            rows={list.rows}
            total={list.total}
            pageSize={list.pageSize}
            basePath={BASE_PATH}
            filters={query}
            detailHrefBase={BASE_PATH}
            showAgentColumn={false}
          />
        </>
      )}
    </div>
  );
}
