"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import { SELECTED_CONTACTS_STORAGE_KEY } from "@/lib/crm/segment";

type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  productLabels: string[];
  unsubscribed: boolean;
};

type BatchOption = { id: string; sheetName: string; tabName: string; rowsImported: number };

/** Course names for the list cell, falling back to the raw label when it names no course. */
function courseSummary(labels: string[]): string {
  const names = labels.map((l) => courseNameFromLabel(l) || l);
  return Array.from(new Set(names)).join(", ");
}

export function ContactsPanel({ initialRows, initialTotal }: { initialRows: ContactRow[]; initialTotal: number }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [courseName, setCourseName] = useState("");
  const [importBatchId, setImportBatchId] = useState("");
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [busy, setBusy] = useState(false);
  // Selection persists across searches deliberately — an admin narrowing
  // down to find specific people across a few searches expects earlier
  // picks to still be checked, not silently dropped.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Two filter changes in quick succession race; without this the slower
  // (older) response can land last and repaint the list with stale rows.
  const latestSearch = useRef(0);
  const [showBulkConvertForm, setShowBulkConvertForm] = useState(false);
  const [bulkProgramMode, setBulkProgramMode] = useState<"course" | "label">("course");
  const [bulkCourseId, setBulkCourseId] = useState("");
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkConvertedAt, setBulkConvertedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [courseChoices, setCourseChoices] = useState<{ id: string; title: string }[]>([]);

  // Both endpoints already exist for the campaign segment builder.
  useEffect(() => {
    fetch("/api/admin/crm/segments/field-values?field=product_label")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const labels = (json?.values as string[] | undefined) ?? [];
        // One course has a dozen price/promo labels; the picker lists courses.
        const names = labels.map(courseNameFromLabel).filter((n) => n !== "");
        setCourseOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});

    fetch("/api/admin/crm/import/batches")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.batches) setBatches(json.batches); })
      .catch(() => {});

    fetch("/api/admin/crm/courses")
      .then((r) => r.json())
      .then((j: { courses?: { id: string; title: string }[] }) => setCourseChoices(j.courses ?? []))
      .catch(() => {});
  }, []);

  async function runSearch(next?: { courseName?: string; importBatchId?: string }) {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (search.trim() !== "") params.set("search", search.trim());
    const course = next?.courseName ?? courseName;
    const batch = next?.importBatchId ?? importBatchId;
    if (course !== "") params.set("courseName", course);
    if (batch !== "") params.set("importBatchId", batch);

    const ticket = ++latestSearch.current;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/contacts?${params.toString()}`);
      if (!res.ok || ticket !== latestSearch.current) return;
      const json = await res.json();
      if (ticket !== latestSearch.current) return;
      // Local state update, not router.refresh() — refresh() cannot reach a
      // mounted client component's own useState.
      setRows(json.rows);
      setTotal(json.total);
    } finally {
      if (ticket === latestSearch.current) setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function useSelectedInCampaign() {
    try {
      sessionStorage.setItem(SELECTED_CONTACTS_STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      toast.error("Could not hand off the selection — try again.");
      return;
    }
    router.push("/dashboard/admin/crm?tab=campaigns");
  }

  function useSelectedInWhatsApp() {
    try {
      sessionStorage.setItem(SELECTED_CONTACTS_STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      toast.error("Could not hand off the selection — try again.");
      return;
    }
    router.push("/dashboard/admin/crm?tab=whatsapp");
  }

  const { run: markSelectedConverted, pending: bulkSaving } = useAsyncAction(async () => {
    const program = bulkProgramMode === "course" ? { kind: "course" as const, courseId: bulkCourseId } : { kind: "label" as const, pattern: bulkLabel.trim() };
    if (bulkProgramMode === "course" && !bulkCourseId) return;
    if (bulkProgramMode === "label" && bulkLabel.trim() === "") return;

    {
      const res = await fetch("/api/admin/crm/manual-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selected), program, convertedAt: bulkConvertedAt || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Could not record these conversions.");
        return;
      }
      toast.success(`Marked ${json.count} contact${json.count === 1 ? "" : "s"} converted.`);
      setShowBulkConvertForm(false);
      setBulkCourseId("");
      setBulkLabel("");
      setSelected(new Set());
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search name, email, or phone"
          className="flex-1 min-w-[240px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
        />
        <Button
          variant="bare"
          size="bare"
          loading={busy}
          onClick={() => runSearch()}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
        >
          {busy ? "Searching…" : "Search"}
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={courseName}
          onChange={(e) => { setCourseName(e.target.value); void runSearch({ courseName: e.target.value }); }}
          className="max-w-[420px] rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
        >
          <option value="">All courses</option>
          {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={importBatchId}
          onChange={(e) => { setImportBatchId(e.target.value); void runSearch({ importBatchId: e.target.value }); }}
          className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
        >
          <option value="">All cohorts</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.sheetName} — {b.tabName} ({b.rowsImported})</option>
          ))}
        </select>

        {(courseName !== "" || importBatchId !== "") && (
          <button
            onClick={() => { setCourseName(""); setImportBatchId(""); void runSearch({ courseName: "", importBatchId: "" }); }}
            className="font-body text-xs font-semibold text-pz-on-surface-variant hover:text-pz-secondary max-md:min-h-11 max-md:px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="font-body text-xs text-pz-on-surface-variant">
          Showing {rows.length} of {total} contacts
        </p>

        {selected.size > 0 && (
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap bg-pz-surface-container-high rounded-2xl md:rounded-full px-4 py-1.5">
            <span className="font-body text-xs font-semibold">{selected.size} selected</span>
            <button
              onClick={useSelectedInCampaign}
              className="font-body text-xs font-semibold text-pz-primary hover:underline  max-md:min-h-11"
            >
              Use in new campaign
            </button>
            <button
              onClick={useSelectedInWhatsApp}
              className="font-body text-xs font-semibold text-pz-primary hover:underline  max-md:min-h-11"
            >
              Use in WhatsApp batch
            </button>
            <button
              onClick={() => setShowBulkConvertForm((v) => !v)}
              className="font-body text-xs font-semibold text-pz-primary hover:underline  max-md:min-h-11"
            >
              Mark {selected.size} selected as converted…
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="font-body text-xs text-pz-on-surface-variant hover:text-pz-secondary  max-md:min-h-11"
            >
              Clear
            </button>
          </div>
        )}

        {selected.size > 0 && showBulkConvertForm && (
          <div className="bg-pz-surface-container-high rounded-2xl p-4 space-y-3 mt-2">
            <div className="flex gap-3 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
                <input type="radio" name="bulkProgramMode" checked={bulkProgramMode === "course"} onChange={() => setBulkProgramMode("course")} />
                Existing course
              </label>
              <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer max-md:min-h-11">
                <input type="radio" name="bulkProgramMode" checked={bulkProgramMode === "label"} onChange={() => setBulkProgramMode("label")} />
                Other program (type a name)
              </label>
            </div>
            {bulkProgramMode === "course" ? (
              <select value={bulkCourseId} onChange={(e) => setBulkCourseId(e.target.value)} className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base">
                <option value="">Select a course…</option>
                {courseChoices.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            ) : (
              <input value={bulkLabel} onChange={(e) => setBulkLabel(e.target.value)} placeholder="Program name" className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base" />
            )}
            <input type="date" value={bulkConvertedAt} onChange={(e) => setBulkConvertedAt(e.target.value)} className="rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base" />
            <Button
              variant="bare"
              size="bare"
              loading={bulkSaving}
              onClick={() => markSelectedConverted()}
              disabled={bulkProgramMode === "course" ? !bulkCourseId : bulkLabel.trim() === ""}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
            >
              {bulkSaving ? "Saving…" : `Mark ${selected.size} converted`}
            </Button>
          </div>
        )}
      </div>

      <ResponsiveList
        rows={rows}
        getKey={(c) => c.id}
        empty={
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Use the Import tab to bring in a cohort sheet."
            action={{ label: "Import contacts", href: "/dashboard/admin/crm?tab=import" }}
          />
        }
        mobile={{
          title: (c) => c.fullName || c.email || "—",
          meta: (c) => [
            c.email,
            c.phoneE164 ?? "Phone needs review",
            c.productLabels.length > 0 ? courseSummary(c.productLabels) : null,
            c.unsubscribed ? "Unsubscribed" : null,
          ].filter(Boolean),
          href: (c) => `/dashboard/admin/crm/contacts/${c.id}`,
        }}
        selection={{
          isSelected: (c) => selected.has(c.id),
          onToggle: (c) => toggleSelected(c.id),
          label: (c) => `Select ${c.fullName || c.email || c.id}`,
        }}
        table={
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead className="text-pz-on-surface-variant text-xs uppercase">
                  <tr>
                    <th className="py-2 w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all shown"
                      />
                    </th>
                    <th>Name</th><th>Email</th><th>Phone</th><th>Registered for</th><th>Country</th><th>Source</th><th>Purchases</th>
                  </tr>
                </thead>
                {rows.map((c) => (
                  <tbody key={c.id}>
                      <tr className="border-t border-pz-outline-variant">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            aria-label={`Select ${c.fullName || c.email || c.id}`}
                          />
                        </td>
                        <td>
                          <Link href={`/dashboard/admin/crm/contacts/${c.id}`} className="text-left underline">
                            {c.fullName || "—"}
                          </Link>
                          {c.unsubscribed && <span className="ml-2 text-xs text-pz-danger">unsubscribed</span>}
                        </td>
                        <td>{c.email ?? "—"}</td>
                        <td className={c.phoneE164 ? "" : "text-pz-danger"}>{c.phoneE164 ?? "needs review"}</td>
                        <td className="max-w-[260px]">
                          {c.productLabels.length === 0 ? "—" : (
                            // Course names read; the full labels (price, promo, tier)
                            // stay one hover away and are shown on the contact detail page.
                            <span title={c.productLabels.join("\n")} className="line-clamp-2">
                              {courseSummary(c.productLabels)}
                            </span>
                          )}
                        </td>
                        <td>{c.country ?? "—"}</td>
                        <td>{c.discoverySource}</td>
                        <td className="tabular-nums">{c.purchaseCount}</td>
                      </tr>
                  </tbody>
                ))}
              </table>
            </div>
        }
      />
    </div>
  );
}
