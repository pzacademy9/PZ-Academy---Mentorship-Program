"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContactsList } from "@/components/admin/crm/ContactsList";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import { SELECTED_CONTACTS_STORAGE_KEY } from "@/lib/crm/segment";
import { ASSIGN_CONTACTS_STORAGE_KEY } from "@/lib/crm/assignment";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

type BatchOption = { id: string; sheetName: string; tabName: string; rowsImported: number };

const PAGE_SIZE = 50;

export function ContactsPanel({ initialRows, initialTotal }: { initialRows: ContactRow[]; initialTotal: number }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  // The search text that produced the rows on screen; paging reuses it rather
  // than whatever is half-typed in the box.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // The page a failed request was after, so "Try again" repeats that request.
  const failedPage = useRef(1);
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

  async function loadPage(
    targetPage: number,
    next?: { search?: string; courseName?: string; importBatchId?: string },
  ) {
    const q = next?.search ?? appliedSearch;
    const course = next?.courseName ?? courseName;
    const batch = next?.importBatchId ?? importBatchId;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((targetPage - 1) * PAGE_SIZE) });
    if (q !== "") params.set("search", q);
    if (course !== "") params.set("courseName", course);
    if (batch !== "") params.set("importBatchId", batch);
    if (next?.search !== undefined) setAppliedSearch(q);

    const ticket = ++latestSearch.current;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/contacts?${params.toString()}`);
      if (ticket !== latestSearch.current) return;
      if (!res.ok) { failedPage.current = targetPage; setError("load"); return; }
      const json = await res.json();
      if (ticket !== latestSearch.current) return;
      const lastPage = Math.max(1, Math.ceil(json.total / PAGE_SIZE));
      if (targetPage > lastPage) {
        // The total shrank under us: show the last page that exists instead
        // of an empty one. The recursive call takes over the ticket and busy flag.
        setTotal(json.total);
        void loadPage(lastPage, next);
        return;
      }
      // Local state update, not router.refresh() — refresh() cannot reach a
      // mounted client component's own useState.
      setRows(json.rows);
      setTotal(json.total);
      setPage(targetPage);
      setError(null);
    } catch {
      if (ticket === latestSearch.current) { failedPage.current = targetPage; setError("load"); }
    } finally {
      if (ticket === latestSearch.current) setBusy(false);
    }
  }

  function runSearch(next?: { courseName?: string; importBatchId?: string }) {
    return loadPage(1, { search: search.trim(), ...next });
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
    router.push("/dashboard/admin/sales-hub/campaigns");
  }

  function useSelectedInWhatsApp() {
    try {
      sessionStorage.setItem(SELECTED_CONTACTS_STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      toast.error("Could not hand off the selection — try again.");
      return;
    }
    router.push("/dashboard/admin/sales-hub/whatsapp");
  }

  function assignSelectedToAgent() {
    if (selected.size > 5000) {
      toast.error("Select 5000 contacts or fewer at a time.");
      return;
    }
    try {
      sessionStorage.setItem(ASSIGN_CONTACTS_STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch {
      toast.error("Could not hand off the selection — try again.");
      return;
    }
    router.push("/dashboard/admin/sales-hub/assign");
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

  const filtered = appliedSearch !== "" || courseName !== "" || importBatchId !== "";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4 md:p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-headline text-sm font-bold uppercase tracking-wide text-pz-secondary">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pz-primary text-xs text-pz-on-primary">1</span>{" "}
          Find people
        </h2>

        <div className="flex gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
            placeholder="Search name, email, or phone"
            className="flex-1 min-w-[240px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm max-md:min-h-11 max-md:text-base"
          />
          <Button
            variant="bare"
            size="bare"
            loading={busy}
            onClick={() => void runSearch()}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold max-md:min-h-11"
          >
            {busy ? "Searching…" : "Search"}
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <select
            aria-label="Course"
            value={courseName}
            onChange={(e) => { setCourseName(e.target.value); void runSearch({ courseName: e.target.value }); }}
            className="max-w-[420px] rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm max-md:w-full max-md:max-w-full max-md:min-h-11 max-md:text-base"
          >
            <option value="">All courses</option>
            {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            aria-label="Class group"
            value={importBatchId}
            onChange={(e) => { setImportBatchId(e.target.value); void runSearch({ importBatchId: e.target.value }); }}
            className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm max-md:w-full max-md:max-w-full max-md:min-h-11 max-md:text-base"
          >
            <option value="">All class groups</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.sheetName} — {b.tabName} ({b.rowsImported})</option>
            ))}
          </select>

          {(courseName !== "" || importBatchId !== "" || appliedSearch !== "") && (
            <button
              onClick={() => { setSearch(""); setCourseName(""); setImportBatchId(""); void loadPage(1, { search: "", courseName: "", importBatchId: "" }); }}
              className="font-body text-xs font-semibold text-pz-on-surface-variant hover:text-pz-secondary max-md:min-h-11 max-md:px-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between flex-wrap gap-2">
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
              onClick={assignSelectedToAgent}
              className="font-body text-xs font-semibold text-pz-primary hover:underline  max-md:min-h-11"
            >
              Assign to a sales agent
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

      <ContactsList
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        busy={busy}
        error={error}
        selected={selected}
        filtered={filtered}
        onToggle={toggleSelected}
        onToggleAllShown={toggleSelectAllVisible}
        onPage={(p) => void loadPage(p)}
        onRetry={() => void loadPage(failedPage.current)}
      />
    </div>
  );
}
