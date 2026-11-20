"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, ChevronRight, GraduationCap, Presentation, Video, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverThumb } from "@/components/ui/CoverThumb";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { EmptyState } from "@/components/ui/empty-state";
import type { ProgramListRow } from "@/lib/data/admin-lms";

type DisplayType = "course" | "workshop" | "webinar";

const SECTIONS: {
  type: DisplayType;
  label: string;
  icon: typeof GraduationCap;
  iconBg: string;
  iconColor: string;
}[] = [
  { type: "course", label: "Courses", icon: GraduationCap, iconBg: "bg-pz-tertiary-container", iconColor: "text-pz-on-tertiary-container" },
  { type: "workshop", label: "Workshops", icon: Presentation, iconBg: "bg-pz-secondary-container", iconColor: "text-pz-on-secondary-container" },
  { type: "webinar", label: "Webinars", icon: Video, iconBg: "bg-pz-tertiary-fixed", iconColor: "text-pz-on-tertiary-fixed" },
];

type PublishFilter = "all" | "published" | "draft";

function toCsv(rows: ProgramListRow[]): string {
  const header = ["Title", "Slug", "Type", "Price (PKR)", "Status", "Published", "Sessions", "Enrollments"];
  const lines = rows.map((r) =>
    [r.title, r.slug, r.type, r.pricePkr, r.status, r.isPublished ? "yes" : "no", r.sessionCount, r.enrollmentCount]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows: ProgramListRow[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "programs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ProgramRow({ row, showBatch = false }: { row: ProgramListRow; showBatch?: boolean }) {
  return (
    <tr className="hover:bg-pz-surface-container-low transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <CoverThumb key={row.thumbnailUrl ?? "none"} url={row.thumbnailUrl} title={row.title} className="w-16 shrink-0 rounded-md" />
          <div className={cn("w-2 h-2 rounded-full", row.isPublished ? "bg-pz-primary" : "bg-pz-surface-dim")} />
          <span
            data-testid={showBatch ? "family-row-title" : undefined}
            className={cn(
              "font-medium transition-colors",
              row.isPublished ? "text-pz-on-surface group-hover:text-pz-primary" : "text-pz-on-surface-variant",
            )}
          >
            {row.title}
            {showBatch && row.batchLabel && (
              <span className="ml-2 text-xs font-normal text-pz-on-surface-variant">{row.batchLabel}</span>
            )}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 text-pz-on-surface-variant font-mono text-xs">{row.slug}</td>
      <td className="px-6 py-4 text-pz-on-surface">PKR {row.pricePkr.toLocaleString()}</td>
      <td className="px-6 py-4">
        <span
          className={cn(
            "text-xs font-bold px-2.5 py-1 rounded-full",
            row.isPublished
              ? "bg-pz-primary-container text-pz-on-primary-container"
              : "bg-pz-surface-container-high text-pz-on-surface-variant",
          )}
        >
          {row.isPublished ? "Published" : "Draft"}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <Link
          href={`/dashboard/admin/courses/${row.id}`}
          className="inline-flex items-center gap-1 text-pz-primary font-medium hover:underline"
        >
          Edit <ChevronRight className="w-4 h-4" />
        </Link>
      </td>
    </tr>
  );
}

function FamilyGroup({ name, rows }: { name: string; rows: ProgramListRow[] }) {
  return (
    <section
      data-testid={`family-group-${name}`}
      className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant overflow-hidden"
    >
      <div className="px-4 md:px-6 py-4 border-b border-pz-outline-variant flex items-center justify-between gap-2">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface min-w-0 break-words">{name}</h3>
        <span className="shrink-0 text-xs font-bold px-3 py-1 rounded-full bg-pz-primary-container text-pz-on-primary-container">
          {rows.length} {rows.length === 1 ? "portal" : "portals"}
        </span>
      </div>
      <ResponsiveList
        rows={rows}
        getKey={(r) => r.id}
        mobile={{
          title: (r) => (r.batchLabel ? `${r.title} · ${r.batchLabel}` : r.title),
          meta: (r) => [r.slug, `PKR ${r.pricePkr.toLocaleString()} · ${r.isPublished ? "Published" : "Draft"}`],
          href: (r) => `/dashboard/admin/courses/${r.id}`,
        }}
        table={
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pz-outline-variant bg-pz-surface-container-low text-left text-[10px] uppercase tracking-widest text-pz-on-surface-variant">
                  <th className="px-6 py-3 font-bold">Course Title</th>
                  <th className="px-6 py-3 font-bold">Slug</th>
                  <th className="px-6 py-3 font-bold">Price</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  <th className="px-6 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ProgramRow key={row.id} row={row} showBatch />
                ))}
              </tbody>
            </table>
          </div>
        }
      />
    </section>
  );
}

export function ProgramLibraryTable({ rows }: { rows: ProgramListRow[] }) {
  const [query, setQuery] = useState("");
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
      if (publishFilter === "published" && !r.isPublished) return false;
      if (publishFilter === "draft" && r.isPublished) return false;
      return true;
    });
  }, [rows, query, publishFilter]);

  const grouped = useMemo(() => {
    const byType = new Map<DisplayType, ProgramListRow[]>();
    for (const section of SECTIONS) byType.set(section.type, []);
    for (const row of filtered) {
      if (row.type === "mentorship") continue; // mentorship is managed separately
      if (row.familyName) continue; // shown under its family heading instead
      byType.get(row.type as DisplayType)?.push(row);
    }
    return byType;
  }, [filtered]);

  // Portals with a course family: one group per family (sorted by name), rows sorted by title.
  const families = useMemo(() => {
    const byFamily = new Map<string, ProgramListRow[]>();
    for (const row of filtered) {
      if (row.type === "mentorship" || !row.familyName) continue;
      byFamily.set(row.familyName, [...(byFamily.get(row.familyName) ?? []), row]);
    }
    return Array.from(byFamily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({ name, rows: [...list].sort((a, b) => a.title.localeCompare(b.title)) }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full md:flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-on-surface-variant" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses by title or slug..."
            className="w-full bg-pz-surface-container-lowest border border-pz-outline-variant rounded-lg pl-9 pr-4 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-pz-primary/30 focus:border-pz-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-pz-surface-container-low p-1 rounded-lg">
            {(["all", "published", "draft"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setPublishFilter(option)}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize max-md:min-h-11",
                  publishFilter === option
                    ? "bg-pz-surface-container-lowest text-pz-primary shadow-sm"
                    : "text-pz-on-surface-variant hover:text-pz-primary",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            onClick={() => downloadCsv(filtered)}
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg border border-pz-outline-variant text-sm font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4" />
            Export List
          </button>
          <Link
            href="/dashboard/admin/courses/import"
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg border border-pz-outline-variant text-sm font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors"
          >
            Build from file
          </Link>
          <Link
            href="/dashboard/admin/courses/ai"
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg border border-pz-outline-variant text-sm font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors"
          >
            Make with AI
          </Link>
          <Link
            href="/dashboard/admin/courses/new"
            className="flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary text-pz-on-primary text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          >
            + Create New Course
          </Link>
        </div>
      </div>

      <div className="space-y-8">
        {families.map((f) => (
          <FamilyGroup key={f.name} name={f.name} rows={f.rows} />
        ))}
        {SECTIONS.map((section) => {
          const sectionRows = grouped.get(section.type) ?? [];
          if (sectionRows.length === 0 && families.length > 0) return null;
          return (
            <section
              key={section.type}
              className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant overflow-hidden"
            >
              <div className="px-4 md:px-6 py-4 border-b border-pz-outline-variant flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", section.iconBg, section.iconColor)}>
                    <section.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-headline text-lg font-bold text-pz-on-surface">{section.label}</h3>
                </div>
                <span
                  className={cn(
                    "text-xs font-bold px-3 py-1 rounded-full",
                    sectionRows.length > 0
                      ? "bg-pz-primary-container text-pz-on-primary-container"
                      : "bg-pz-surface-container-high text-pz-on-surface-variant",
                  )}
                >
                  {sectionRows.length} {sectionRows.length === 1 ? "program" : "programs"}
                </span>
              </div>

              <ResponsiveList
                rows={sectionRows}
                getKey={(r) => r.id}
                mobile={{
                  title: (r) => r.title,
                  meta: (r) => [r.slug, `PKR ${r.pricePkr.toLocaleString()} · ${r.isPublished ? "Published" : "Draft"}`],
                  href: (r) => `/dashboard/admin/courses/${r.id}`,
                  cover: (r) => (
                    <Link href={`/dashboard/admin/courses/${r.id}`} tabIndex={-1} aria-hidden="true" className="block">
                      <CoverThumb key={r.thumbnailUrl ?? "none"} url={r.thumbnailUrl} title={r.title} />
                    </Link>
                  ),
                }}
                empty={
                  <EmptyState
                    icon={PackageOpen}
                    title={`No ${section.label.toLowerCase()} yet.`}
                    action={{
                      label: `+ Add ${section.type === "course" ? "Course" : section.type === "workshop" ? "Workshop" : "Webinar"}`,
                      href: `/dashboard/admin/courses/new?type=${section.type}`,
                    }}
                  />
                }
                table={
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-pz-outline-variant bg-pz-surface-container-low text-left text-[10px] uppercase tracking-widest text-pz-on-surface-variant">
                          <th className="px-6 py-3 font-bold">Course Title</th>
                          <th className="px-6 py-3 font-bold">Slug</th>
                          <th className="px-6 py-3 font-bold">Price</th>
                          <th className="px-6 py-3 font-bold">Status</th>
                          <th className="px-6 py-3 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionRows.map((row) => (
                          <ProgramRow key={row.id} row={row} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
              />
            </section>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <EmptyState icon={Search} title="No programs match your search." description="Try a different search or filter." />
      )}

      <p className="text-xs text-pz-on-surface-variant italic">
        Draft courses are hidden from the public site until published.
      </p>
    </div>
  );
}
