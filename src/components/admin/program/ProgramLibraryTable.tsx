"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgramListRow } from "@/lib/data/admin-lms";

const TYPE_BADGE: Record<ProgramListRow["type"], string> = {
  course: "bg-pz-primary-container text-pz-on-primary-container",
  workshop: "bg-pz-secondary-container text-pz-on-secondary-container",
  webinar: "bg-pz-tertiary-container text-pz-on-tertiary-container",
  mentorship: "bg-pz-tertiary-container text-pz-on-tertiary-container",
};

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

export function ProgramLibraryTable({ rows }: { rows: ProgramListRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pz-on-surface-variant" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses by title or slug..."
            className="w-full bg-pz-surface-container-lowest border border-pz-outline-variant rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pz-primary/30 focus:border-pz-primary"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCsv(filtered)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-pz-outline-variant text-sm font-medium text-pz-on-surface-variant hover:bg-pz-surface-container-low transition-colors"
          >
            <Download className="w-4 h-4" />
            Export List
          </button>
          <Link
            href="/dashboard/admin/courses/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pz-primary text-pz-on-primary text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          >
            + Create New Course
          </Link>
        </div>
      </div>

      <div className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant overflow-hidden">
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
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-pz-outline-variant/50 last:border-b-0 hover:bg-pz-surface-container-low/50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-headline font-bold text-pz-on-surface">{row.title}</p>
                  <span className={cn("inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", TYPE_BADGE[row.type])}>
                    {row.type}
                  </span>
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-pz-on-surface-variant">
                  No programs match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-6 py-3 text-xs text-pz-on-surface-variant border-t border-pz-outline-variant bg-pz-surface-container-low">
          Showing {filtered.length} of {rows.length} programs
        </div>
      </div>

      <p className="text-xs text-pz-on-surface-variant italic">
        Draft courses are hidden from the public site until published.
      </p>
    </div>
  );
}
