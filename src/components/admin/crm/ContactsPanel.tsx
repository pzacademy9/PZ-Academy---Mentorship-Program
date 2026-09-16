"use client";

import { useEffect, useRef, useState } from "react";
import { courseNameFromLabel } from "@/lib/crm/product-label";

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
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [courseName, setCourseName] = useState("");
  const [importBatchId, setImportBatchId] = useState("");
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  // Two filter changes in quick succession race; without this the slower
  // (older) response can land last and repaint the list with stale rows.
  const latestSearch = useRef(0);

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
      setOpenId(null);
    } finally {
      if (ticket === latestSearch.current) setBusy(false);
    }
  }

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/admin/crm/contacts/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search name, email, or phone"
          className="flex-1 min-w-[240px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <button
          onClick={() => runSearch()}
          disabled={busy}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={courseName}
          onChange={(e) => { setCourseName(e.target.value); void runSearch({ courseName: e.target.value }); }}
          className="max-w-[420px] rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm"
        >
          <option value="">All courses</option>
          {courseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={importBatchId}
          onChange={(e) => { setImportBatchId(e.target.value); void runSearch({ importBatchId: e.target.value }); }}
          className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm"
        >
          <option value="">All cohorts</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.sheetName} — {b.tabName} ({b.rowsImported})</option>
          ))}
        </select>

        {(courseName !== "" || importBatchId !== "") && (
          <button
            onClick={() => { setCourseName(""); setImportBatchId(""); void runSearch({ courseName: "", importBatchId: "" }); }}
            className="font-body text-xs font-semibold text-pz-on-surface-variant hover:text-pz-secondary"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="font-body text-xs text-pz-on-surface-variant">
        Showing {rows.length} of {total} contacts
      </p>

      {rows.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No contacts yet. Use the Import tab to bring in a cohort sheet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead className="text-pz-on-surface-variant text-xs uppercase">
              <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Registered for</th><th>Country</th><th>Source</th><th>Purchases</th></tr>
            </thead>
            {rows.map((c) => (
              <tbody key={c.id}>
                  <tr className="border-t border-pz-outline-variant">
                    <td className="py-2">
                      <button onClick={() => toggleDetail(c.id)} className="text-left underline">
                        {c.fullName || "—"}
                      </button>
                      {c.unsubscribed && <span className="ml-2 text-xs text-pz-danger">unsubscribed</span>}
                    </td>
                    <td>{c.email ?? "—"}</td>
                    <td className={c.phoneE164 ? "" : "text-pz-danger"}>{c.phoneE164 ?? "needs review"}</td>
                    <td className="max-w-[260px]">
                      {c.productLabels.length === 0 ? "—" : (
                        // Course names read; the full labels (price, promo, tier)
                        // stay one hover away and are listed in the detail row.
                        <span title={c.productLabels.join("\n")} className="line-clamp-2">
                          {courseSummary(c.productLabels)}
                        </span>
                      )}
                    </td>
                    <td>{c.country ?? "—"}</td>
                    <td>{c.discoverySource}</td>
                    <td className="tabular-nums">{c.purchaseCount}</td>
                  </tr>
                  {openId === c.id && (
                    <tr className="border-t border-pz-outline-variant bg-pz-surface">
                      <td colSpan={7} className="p-4">
                        {detail === null ? (
                          <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                        ) : (
                          <div className="space-y-1 font-body text-xs">
                            <p>Profession: {String(detail.profession ?? "—")} · Raw phone: {String(detail.phoneRaw ?? "—")} · Platform account: {detail.hasPlatformAccount ? "yes" : "no"}</p>
                            {(detail.purchases as Array<Record<string, unknown>>).map((p) => (
                              <p key={String(p.id)}>
                                {String(p.productLabel) || "—"} · {p.amount === null ? "—" : `${String(p.currency ?? "")} ${String(p.amount)}`}
                                {p.isEarlyBird ? " · early bird" : ""} · {String(p.rowType)}
                                {p.promoCode ? ` · promo ${String(p.promoCode)}` : ""} · {String(p.sourceRowRef)}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
