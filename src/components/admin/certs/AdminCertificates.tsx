import Link from "next/link";
import { Award, ExternalLink, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { CertStatusChip } from "@/components/certs/CertificateGroups";
import { cn } from "@/lib/utils";
import { CATEGORY_SUBCATS, type CertRecord, type CertStatus } from "@/lib/certs/cert-model";

export type AdminCertificatesProps = {
  rows: CertRecord[];
  total: number;
  page: number;
  pageCount: number;
  pageSize?: number;
  counts: {
    byCategory: Record<string, number>;
    bySubCategory: Record<string, number>;
    byStatus: Record<string, number>;
  };
  tab: "general" | "official";
  group?: string;
  batch?: string;
  status?: CertStatus;
  q?: string;
  batches: { id: string; name: string; topic: string; count: number }[];
  unavailable: boolean;
};

const BASE = "/dashboard/admin/certificates";
const APP_URL = "https://cert.pharmacozyme.com";
const STATUSES: { key: CertStatus; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "generated", label: "Generated" },
  { key: "pending", label: "Pending" },
  { key: "revoked", label: "Revoked" },
];

type Params = Pick<AdminCertificatesProps, "tab" | "group" | "batch" | "status" | "q">;

// Builds a link that keeps the current filters except the ones overridden. `page` is only set when given.
function href(cur: Params, over: Partial<Params> & { page?: number } = {}): string {
  const m = { ...cur, ...over };
  const sp = new URLSearchParams();
  sp.set("tab", m.tab);
  if (m.group) sp.set("group", m.group);
  if (m.batch) sp.set("batch", m.batch);
  if (m.status) sp.set("status", m.status);
  if (m.q) sp.set("q", m.q);
  if (over.page && over.page > 1) sp.set("page", String(over.page));
  return `${BASE}?${sp.toString()}`;
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((n, v) => n + v, 0);

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-body text-sm font-semibold",
        active
          ? "border-pz-primary bg-pz-primary-container text-pz-on-primary-container"
          : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface hover:bg-pz-surface-container-low",
      )}
    >
      {children}
    </Link>
  );
}

export function AdminCertificates(props: AdminCertificatesProps) {
  const { rows, total, page, pageCount, counts, tab, group, batch, status, q, batches, unavailable } = props;
  const pageSize = props.pageSize ?? 25;
  const cur: Params = { tab, group, batch, status, q };
  const category = tab === "official" ? "Official" : "General";

  return (
    <div className="space-y-6">
      <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Certificates</h1>

      <div className="flex flex-col gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body text-sm text-pz-on-surface-variant">
          Certificates are made in the Certificates app. This page shows them here.
        </p>
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-pz-primary px-4 font-body text-sm font-bold text-pz-on-primary hover:opacity-90"
        >
          Open Certificates app
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>

      {unavailable ? (
        <div role="alert" className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-6">
          <p className="font-body text-base text-pz-on-surface">
            We could not reach the Certificates app. Try again in a minute.
          </p>
          <Link
            href={href(cur, { page })}
            className="inline-flex min-h-11 items-center font-body text-sm font-bold text-pz-primary hover:underline"
          >
            Try again
          </Link>
        </div>
      ) : (
        <>
          <nav aria-label="Certificate type" className="grid grid-cols-2 gap-2">
            {(["general", "official"] as const).map((t) => {
              const label = t === "general" ? "General" : "Official";
              return (
                <Link
                  key={t}
                  href={href({ tab: t }, {})}
                  aria-current={tab === t ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 font-headline text-lg font-bold",
                    tab === t
                      ? "border-pz-primary bg-pz-primary text-pz-on-primary"
                      : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface hover:bg-pz-surface-container-low",
                  )}
                >
                  {label}
                  <span className="font-body text-sm font-semibold opacity-80">{counts.byCategory[label] ?? 0}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap gap-2" data-testid="group-chips">
            <Chip to={href(cur, { group: undefined, batch: undefined })} active={!group}>
              All <span className="opacity-70">{sum(counts.bySubCategory)}</span>
            </Chip>
            {CATEGORY_SUBCATS[category].map((g) => (
              <Chip key={g} to={href(cur, { group: g, batch: undefined })} active={group === g}>
                {g} <span className="opacity-70">{counts.bySubCategory[g] ?? 0}</span>
              </Chip>
            ))}
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-testid="batch-cards">
            <div className="flex gap-3 pb-2">
              <Link
                href={href(cur, { batch: undefined })}
                aria-current={!batch ? "true" : undefined}
                className={cn(
                  "min-w-40 shrink-0 rounded-xl border p-3",
                  !batch
                    ? "border-pz-primary bg-pz-primary-container text-pz-on-primary-container"
                    : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface",
                )}
              >
                <span className="block font-headline text-sm font-bold">All batches</span>
              </Link>
              {batches.map((b) => (
                <Link
                  key={b.id}
                  href={href(cur, { batch: b.id })}
                  aria-current={batch === b.id ? "true" : undefined}
                  className={cn(
                    "min-w-48 shrink-0 rounded-xl border p-3",
                    batch === b.id
                      ? "border-pz-primary bg-pz-primary-container text-pz-on-primary-container"
                      : "border-pz-outline-variant bg-pz-surface-container-lowest text-pz-on-surface",
                  )}
                >
                  <span className="block font-headline text-sm font-bold">{b.name}</span>
                  <span className="block font-body text-xs opacity-80">{b.topic}</span>
                  <span className="mt-1 block font-body text-xs font-semibold">
                    {b.count} {b.count === 1 ? "certificate" : "certificates"}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <form method="get" action={BASE} className="relative">
            <input type="hidden" name="tab" value={tab} />
            {group && <input type="hidden" name="group" value={group} />}
            {batch && <input type="hidden" name="batch" value={batch} />}
            {status && <input type="hidden" name="status" value={status} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name, email or certificate number"
              aria-label="Search by name, email or certificate number"
              className="min-h-11 w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest pl-9 pr-3 font-body text-sm text-pz-on-surface"
            />
          </form>

          <div className="flex flex-wrap gap-2" data-testid="status-chips">
            <Chip to={href(cur, { status: undefined })} active={!status}>
              All <span className="opacity-70">{sum(counts.byStatus)}</span>
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s.key} to={href(cur, { status: s.key })} active={status === s.key}>
                {s.label} <span className="opacity-70">{counts.byStatus[s.key] ?? 0}</span>
              </Chip>
            ))}
          </div>

          <ResponsiveList
            rows={rows}
            getKey={(c) => c.id}
            empty={<EmptyState icon={Award} title="No certificates found." />}
            mobile={{
              title: (c) => c.name || c.email,
              meta: (c) => [c.email, `${c.subCategory} · ${c.batchName}`, `${c.certId} · ${c.issueDate}`],
              footer: (c) => (
                <div className="flex items-center justify-between gap-3 border-t border-pz-outline-variant px-3 py-1">
                  <CertStatusChip status={c.status} />
                  <a href={c.viewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-body text-sm font-bold text-pz-primary hover:underline">
                    View certificate
                  </a>
                </div>
              ),
            }}
            table={
              <div className="overflow-x-auto rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest">
                <table className="w-full text-left font-body text-sm">
                  <thead className="bg-pz-surface-container-low text-xs font-bold uppercase text-pz-on-surface-variant">
                    <tr>
                      {["Name", "Email", "Group", "Batch", "Topic", "Certificate number", "Issue date", "Status"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2">{h}</th>
                      ))}
                      <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pz-outline-variant text-pz-on-surface">
                    {rows.map((c) => (
                      <tr key={c.id} className={cn(c.status === "revoked" && "opacity-60")}>
                        <td className="px-3 py-2 font-semibold">{c.name}</td>
                        <td className="break-all px-3 py-2">{c.email}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-pz-surface-container-high px-2.5 py-0.5 text-xs font-bold">{c.subCategory}</span>
                        </td>
                        <td className="px-3 py-2">{c.batchName}</td>
                        <td className="px-3 py-2">{c.topic}</td>
                        <td className="whitespace-nowrap px-3 py-2">{c.certId}</td>
                        <td className="whitespace-nowrap px-3 py-2">{c.issueDate}</td>
                        <td className="px-3 py-2"><CertStatusChip status={c.status} /></td>
                        <td className="px-3 py-2">
                          <a href={c.viewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center whitespace-nowrap font-bold text-pz-primary hover:underline">
                            View certificate
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-body text-sm text-pz-on-surface-variant">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={href(cur, { page: page - 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-pz-outline-variant px-4 font-body text-sm font-semibold text-pz-on-surface">
                    Previous
                  </Link>
                )}
                {page < pageCount && (
                  <Link href={href(cur, { page: page + 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-pz-outline-variant px-4 font-body text-sm font-semibold text-pz-on-surface">
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
