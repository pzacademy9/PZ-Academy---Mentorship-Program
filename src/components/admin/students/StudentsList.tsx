import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import type { CertChip, StudentFilter, StudentListRow } from "@/lib/data/admin-students";

export type StudentsListProps = {
  rows: StudentListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize?: number;
  q?: string;
  filter: StudentFilter;
};

const BASE = "/dashboard/admin/students";
const FILTERS: { key: StudentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "payment-pending", label: "Payment pending" },
  { key: "finished", label: "Finished course" },
];
const MAX_COURSE_CHIPS = 2;

// Keeps the current search and filter except what is overridden. `page` is only set above 1.
function href(cur: { q?: string; filter: StudentFilter }, over: { filter?: StudentFilter; page?: number } = {}): string {
  const filter = over.filter ?? cur.filter;
  const sp = new URLSearchParams();
  if (filter !== "all") sp.set("filter", filter);
  if (cur.q) sp.set("q", cur.q);
  if (over.page && over.page > 1) sp.set("page", String(over.page));
  const qs = sp.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

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

const CERT_LABEL: Record<Exclude<CertChip, "unknown">, string> = {
  issued: "Issued",
  pending: "Pending",
  none: "None",
};

function CertificateChip({ value }: { value: CertChip }) {
  if (value === "unknown") {
    return (
      <span aria-label="Certificate status unavailable" className="text-pz-on-surface-variant">
        {"—"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold",
        value === "issued" && "border-pz-primary bg-pz-primary-container text-pz-on-primary-container",
        value === "pending" && "border-pz-outline-variant bg-pz-surface-container-high text-pz-on-surface",
        value === "none" && "border-pz-outline-variant text-pz-on-surface-variant",
      )}
    >
      {CERT_LABEL[value]}
    </span>
  );
}

function CourseChips({ courses }: { courses: StudentListRow["courses"] }) {
  if (courses.length === 0) return <span className="text-pz-on-surface-variant">{"—"}</span>;
  const shown = courses.slice(0, MAX_COURSE_CHIPS);
  const extra = courses.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c, i) => (
        <span
          key={`${c.title}-${i}`}
          className="max-w-40 truncate rounded-full bg-pz-surface-container-high px-2.5 py-0.5 text-xs font-bold"
        >
          {c.title}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-full bg-pz-surface-container-high px-2.5 py-0.5 text-xs font-bold">+{extra}</span>
      )}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label="Progress"
        className="h-2 w-24 overflow-hidden rounded-full bg-pz-surface-container-high"
      >
        <div className="h-full rounded-full bg-pz-primary" style={{ width: `${value}%` }} />
      </div>
      <span className="font-body text-xs font-semibold text-pz-on-surface">{value}%</span>
    </div>
  );
}

const recordHref = (s: StudentListRow) => `${BASE}/${encodeURIComponent(s.id)}`;

export function StudentsList(props: StudentsListProps) {
  const { rows, total, page, pageCount, q, filter } = props;
  const pageSize = props.pageSize ?? 25;
  const cur = { q, filter };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Students</h1>
        <p className="font-body text-sm text-pz-on-surface-variant">
          {total} {total === 1 ? "student" : "students"}
        </p>
      </div>

      <form method="get" action={BASE} className="relative">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pz-on-surface-variant"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, email or phone"
          aria-label="Search by name, email or phone"
          className="min-h-11 w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest pl-9 pr-3 font-body text-sm text-pz-on-surface"
        />
      </form>

      <div className="flex flex-wrap gap-2" data-testid="filter-chips">
        {FILTERS.map((f) => (
          <Chip key={f.key} to={href(cur, { filter: f.key })} active={filter === f.key}>
            {f.label}
          </Chip>
        ))}
      </div>

      <ResponsiveList
        rows={rows}
        getKey={(s) => s.id}
        empty={<EmptyState icon={Users} title="No students match your search." />}
        mobile={{
          title: (s) => s.fullName || s.email || "Student",
          href: recordHref,
          meta: (s) => [
            s.email ?? "",
            `${s.courses.length} ${s.courses.length === 1 ? "course" : "courses"} · ${s.progress}% · ${s.attended}`,
          ],
          footer: (s) => (
            <div className="flex items-center justify-between gap-3 border-t border-pz-outline-variant px-3 py-2 font-body text-xs text-pz-on-surface-variant">
              <span>Joined {formatDate(s.joinedAt)}</span>
              <CertificateChip value={s.certificate} />
            </div>
          ),
        }}
        table={
          <div className="overflow-x-auto rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest">
            <table className="w-full text-left font-body text-sm">
              <thead className="bg-pz-surface-container-low text-xs font-bold uppercase text-pz-on-surface-variant">
                <tr>
                  {["Student", "Courses", "Progress", "Sessions attended", "Certificate", "Joined"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant text-pz-on-surface">
                {rows.map((s) => (
                  <tr key={s.id} className="hover:bg-pz-surface-container-low">
                    <td className="px-3 py-2">
                      <Link href={recordHref(s)} className="flex min-h-11 items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-pz-primary-container text-xs font-bold text-pz-on-primary-container">
                            {initials(s.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block font-semibold">{s.fullName}</span>
                          <span className="block break-all text-xs text-pz-on-surface-variant">{s.email ?? ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <CourseChips courses={s.courses} />
                    </td>
                    <td className="px-3 py-2">
                      <ProgressBar percent={s.progress} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{s.attended}</td>
                    <td className="px-3 py-2">
                      <CertificateChip value={s.certificate} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(s.joinedAt)}</td>
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
              <Link
                href={href(cur, { page: page - 1 })}
                className="inline-flex min-h-11 items-center rounded-lg border border-pz-outline-variant px-4 font-body text-sm font-semibold text-pz-on-surface"
              >
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={href(cur, { page: page + 1 })}
                className="inline-flex min-h-11 items-center rounded-lg border border-pz-outline-variant px-4 font-body text-sm font-semibold text-pz-on-surface"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
