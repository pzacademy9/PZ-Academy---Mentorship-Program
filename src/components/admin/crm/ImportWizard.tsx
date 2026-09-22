"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnMappingInput } from "@/lib/validations/crm";

type Tab = { name: string; headers: string[]; rowCount: number; guessedMapping: ColumnMappingInput };

type Preview = {
  rowsTotal: number;
  rowsImportable: number;
  rowsSkipped: number;
  contactsNew: number;
  contactsExisting: number;
  phoneFailures: number;
  productLabels: string[];
  samples: Array<{ rowRef: string; name: string; email: string | null; phone: string | null; product: string; rowType: string }>;
};

const FIELDS: Array<{ key: keyof ColumnMappingInput; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "WhatsApp / Phone" },
  { key: "profession", label: "Profession" },
  { key: "discovery", label: "Discovery source" },
  { key: "product", label: "Registration option" },
  { key: "rowType", label: "Row type" },
  { key: "promoCode", label: "Promo code" },
  { key: "purchasedAt", label: "Purchase date" },
];

export function ImportWizard() {
  const router = useRouter();
  const [sheetInput, setSheetInput] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMappingInput | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [courses, setCourses] = useState<Array<{ id: string; title: string; type: string }>>([]);
  const [courseId, setCourseId] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/crm/courses")
      .then((res) => res.json())
      .then((json) => setCourses(json.courses ?? []))
      .catch(() => setCourses([]));
  }, []);

  const activeTab = tabs.find((t) => t.name === selectedTab) ?? null;

  async function loadTabs() {
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/crm/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read that sheet.");
      setTabs(json.tabs);
      setSheetName(json.sheetName ?? "");
      setSelectedTab(null);
      setMapping(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that sheet.");
    } finally {
      setBusy(false);
    }
  }

  function chooseTab(tab: Tab) {
    // Prefill from the server's guess, which the admin can then correct.
    setSelectedTab(tab.name);
    setMapping(tab.guessedMapping);
    setPreview(null);
    setDone(null);
  }

  async function runPreview() {
    if (!mapping || !selectedTab) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetInput, tabName: selectedTab, mapping }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed.");
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!mapping || !selectedTab) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: sheetInput,
          tabName: selectedTab,
          mapping,
          sheetName,
          ...(courseId ? { courseId } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed.");
      setDone(
        `Imported ${json.rowsImported} rows — ${json.contactsCreated} new contacts, ${json.contactsMerged} matched existing. ${json.mergeCandidates} possible duplicates queued for review.`,
      );
      setPreview(null);
      // refresh() updates the server-rendered tab counts above this
      // component; the local `done` banner is what tells the admin the
      // import worked, because refresh() cannot reach this component's state.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1 — sheet */}
      <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
        <h2 className="font-headline font-semibold text-pz-secondary">1. Choose a sheet</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            value={sheetInput}
            onChange={(e) => setSheetInput(e.target.value)}
            placeholder="Paste the Google Sheets URL"
            className="flex-1 min-w-[280px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
          />
          <button
            onClick={loadTabs}
            disabled={busy || sheetInput.trim() === ""}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Reading…" : "Read sheet"}
          </button>
        </div>
        {sheetName && <p className="font-body text-xs text-pz-on-surface-variant">Opened: {sheetName}</p>}
      </section>

      {/* Step 2 — tab */}
      {tabs.length > 0 && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <h2 className="font-headline font-semibold text-pz-secondary">2. Choose a tab</h2>
          <div className="flex gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                onClick={() => chooseTab(tab)}
                className={`px-4 py-2 rounded-full font-body text-sm ${selectedTab === tab.name ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-variant text-pz-on-surface-variant"}`}
              >
                {tab.name} <span className="tabular-nums opacity-70">({tab.rowCount})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3 — mapping */}
      {activeTab && mapping && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <h2 className="font-headline font-semibold text-pz-secondary">3. Map the columns</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="font-body text-sm">
                <span className="block text-pz-on-surface-variant mb-1">{field.label}</span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field.key]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-pz-outline-variant px-3 py-2"
                >
                  <option value="">— not mapped —</option>
                  {activeTab.headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="block font-body text-sm">
            <span className="block text-pz-on-surface-variant mb-1">Course (optional — tags every row in this batch)</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full sm:w-1/2 rounded-xl border border-pz-outline-variant px-3 py-2"
            >
              <option value="">— not tagged —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.type})
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={runPreview}
            disabled={busy}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Checking…" : "Preview import"}
          </button>
        </section>
      )}

      {/* Step 4 — dry run */}
      {preview && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-4">
          <h2 className="font-headline font-semibold text-pz-secondary">4. Dry run — nothing has been saved yet</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-body text-sm">
            <Stat label="Rows in tab" value={preview.rowsTotal} />
            <Stat label="Importable" value={preview.rowsImportable} />
            <Stat label="Skipped (no email or phone)" value={preview.rowsSkipped} />
            <Stat label="New contacts" value={preview.contactsNew} />
            <Stat label="Already known" value={preview.contactsExisting} />
            <Stat label="Phone needs review" value={preview.phoneFailures} />
          </div>

          {preview.productLabels.length > 0 && (
            <div>
              <p className="font-body text-xs text-pz-on-surface-variant mb-1">Product labels found:</p>
              <p className="font-body text-sm">{preview.productLabels.join(" · ")}</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-2">Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Product</th><th>Type</th></tr>
              </thead>
              <tbody>
                {preview.samples.map((s) => (
                  <tr key={s.rowRef} className="border-t border-pz-outline-variant">
                    <td className="py-2 tabular-nums">{s.rowRef}</td>
                    <td>{s.name}</td>
                    <td>{s.email ?? "—"}</td>
                    <td className={s.phone ? "" : "text-pz-danger"}>{s.phone ?? "needs review"}</td>
                    <td>{s.product || "—"}</td>
                    <td>{s.rowType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={commit}
            disabled={busy || preview.rowsImportable === 0}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${preview.rowsImportable} rows`}
          </button>
        </section>
      )}

      {error && <p className="font-body text-sm text-pz-danger">{error}</p>}
      {done && <p className="font-body text-sm text-pz-primary">{done}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-pz-surface rounded-xl px-3 py-2">
      <p className="text-xs text-pz-on-surface-variant">{label}</p>
      <p className="font-headline font-bold text-lg tabular-nums">{value}</p>
    </div>
  );
}
