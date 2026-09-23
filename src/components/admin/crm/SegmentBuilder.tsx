"use client";

import { useEffect, useRef, useState } from "react";
import { SEGMENT_FIELDS, type SegmentFilter } from "@/lib/crm/segment";

type ImportBatchOption = { id: string; sheetName: string; tabName: string; rowsImported: number; createdAt: string };
type CourseOption = { id: string; title: string; type: string };

// row_type and discovery_source are closed enums (see segmentFilterSchema) —
// rendered as checkboxes/select from these literals directly, no DB round trip.
const ROW_TYPE_OPTIONS = ["individual", "group_leader", "group_member"] as const;
const DISCOVERY_SOURCE_OPTIONS = ["instagram", "facebook", "whatsapp", "other", "unknown"] as const;
// country is genuinely open vocabulary; profession/product_label/promo_code are
// open text but benefit from suggesting real values already seen in the data.
const OPEN_VOCAB_FIELDS = ["country", "profession", "product_label", "promo_code"] as const;

const AUTO_COUNT_DELAY_MS = 500;

/**
 * Filters combine with AND. The live count is the whole point of this
 * component: an admin should never discover a segment's size at send time.
 */
export function SegmentBuilder({
  value,
  onChange,
  channel = "email",
}: {
  value: SegmentFilter[];
  onChange: (next: SegmentFilter[]) => void;
  channel?: "email" | "whatsapp";
}) {
  const [count, setCount] = useState<number | null>(null);
  const [samples, setSamples] = useState<Array<{ fullName: string; email?: string; phoneE164?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<ImportBatchOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const autoCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/admin/crm/import/batches")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.batches) setBatches(json.batches); })
      .catch(() => {});

    fetch("/api/admin/crm/courses")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json?.courses) setCourses(json.courses); })
      .catch(() => {});

    Promise.all(
      OPEN_VOCAB_FIELDS.map((field) =>
        fetch(`/api/admin/crm/segments/field-values?field=${field}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => [field, (json?.values as string[] | undefined) ?? []] as const)
          .catch(() => [field, []] as const),
      ),
    ).then((pairs) => setFieldValues(Object.fromEntries(pairs)));

    return () => { if (autoCountTimer.current) clearTimeout(autoCountTimer.current); };
  }, []);

  async function refreshCount(filters: SegmentFilter[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: filters, channel }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCount(null);
        setError(json.error ?? "Could not count that segment.");
        return;
      }
      setCount(json.total);
      setSamples(json.samples ?? []);
    } finally {
      setBusy(false);
    }
  }

  // A freshly added filter (e.g. Country with no box checked yet) is
  // incomplete by construction — the server correctly 400s it, but firing
  // that request automatically would flash an alarming error before the
  // admin has touched the new filter at all.
  function isFilterComplete(f: SegmentFilter): boolean {
    if ("values" in f) return f.values.length > 0;
    if (typeof f.value === "string") return f.value.trim() !== "";
    return true;
  }

  function update(next: SegmentFilter[]) {
    onChange(next);
    setCount(null);
    setError(null);
    // Debounced so a segment being actively edited (e.g. typing a country
    // code) does not fire a count request on every keystroke.
    if (autoCountTimer.current) clearTimeout(autoCountTimer.current);
    if (next.every(isFilterComplete)) {
      autoCountTimer.current = setTimeout(() => { void refreshCount(next); }, AUTO_COUNT_DELAY_MS);
    }
  }

  function addFilter(field: SegmentFilter["field"]) {
    // Each field has exactly one valid default operator; picking it here
    // means the builder can never emit a field/operator pair the schema
    // rejects.
    const defaults: Record<SegmentFilter["field"], SegmentFilter> = {
      contact_id: { field: "contact_id", op: "in", values: [] },
      import_batch_id: { field: "import_batch_id", op: "in", values: [] },
      course_id: { field: "course_id", op: "in", values: [] },
      row_type: { field: "row_type", op: "eq", value: "group_leader" },
      product_label: { field: "product_label", op: "contains", value: "" },
      promo_code: { field: "promo_code", op: "eq", value: "" },
      discovery_source: { field: "discovery_source", op: "in", values: [] },
      country: { field: "country", op: "in", values: [] },
      profession: { field: "profession", op: "contains", value: "" },
      purchase_count: { field: "purchase_count", op: "gte", value: 2 },
      last_purchase_at: { field: "last_purchase_at", op: "before", value: "" },
      has_platform_account: { field: "has_platform_account", op: "eq", value: false },
    };
    update([...value, defaults[field]]);
  }

  function patch(index: number, next: SegmentFilter) {
    update(value.map((f, i) => (i === index ? next : f)));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value=""
          onChange={(e) => { if (e.target.value) addFilter(e.target.value as SegmentFilter["field"]); }}
          className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm"
        >
          <option value="">+ Add a filter…</option>
          {SEGMENT_FIELDS.map((f) => (
            <option key={f.field} value={f.field}>{f.label}</option>
          ))}
        </select>

        <button
          onClick={() => refreshCount(value)}
          disabled={busy}
          className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Counting…" : "Count matches"}
        </button>

        {count !== null && (
          <span className="px-4 py-2 font-body text-sm">
            <strong className="tabular-nums">{count}</strong> contacts match
          </span>
        )}
      </div>

      {error && <p className="font-body text-sm text-pz-danger">{error}</p>}

      {value.length === 0 && (
        <p className="font-body text-xs text-pz-on-surface-variant">
          {channel === "whatsapp"
            ? "No filters — this matches every contact with a valid WhatsApp number who hasn't opted out."
            : "No filters — this matches every contact who has an email, has not unsubscribed, and has not bounced."}
        </p>
      )}

      {value.map((filter, index) => (
        <div key={index} className="flex gap-2 items-center flex-wrap bg-pz-surface-container-high rounded-xl px-3 py-2">
          <span className="font-body text-sm font-medium">
            {filter.field === "contact_id"
              ? "Specific contacts"
              : SEGMENT_FIELDS.find((f) => f.field === filter.field)?.label ?? filter.field}
          </span>

          {filter.field === "contact_id" ? (
            <span className="flex-1 font-body text-xs text-pz-on-surface-variant">
              {filter.values.length} contact{filter.values.length === 1 ? "" : "s"} — picked from the Contacts tab
            </span>
          ) : filter.field === "import_batch_id" ? (
            <div className="flex-1 min-w-[220px] flex flex-wrap gap-2">
              {batches.length === 0 ? (
                <span className="font-body text-xs text-pz-on-surface-variant">No import batches yet.</span>
              ) : (
                batches.map((b) => {
                  const checked = filter.values.includes(b.id);
                  const label = `${b.sheetName} — ${b.tabName} (${b.rowsImported})`;
                  return (
                    <label key={b.id} title={b.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-pz-outline-variant text-xs font-body cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          patch(index, {
                            ...filter,
                            values: e.target.checked ? [...filter.values, b.id] : filter.values.filter((v) => v !== b.id),
                          } as SegmentFilter)
                        }
                      />
                      {label}
                    </label>
                  );
                })
              )}
            </div>
          ) : filter.field === "course_id" ? (
            <div className="flex-1 min-w-[220px] flex flex-wrap gap-2">
              {courses.length === 0 ? (
                <span className="font-body text-xs text-pz-on-surface-variant">No courses yet.</span>
              ) : (
                courses.map((c) => {
                  const checked = filter.values.includes(c.id);
                  return (
                    <label key={c.id} title={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-pz-outline-variant text-xs font-body cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          patch(index, {
                            ...filter,
                            values: e.target.checked ? [...filter.values, c.id] : filter.values.filter((v) => v !== c.id),
                          } as SegmentFilter)
                        }
                      />
                      {c.title}
                    </label>
                  );
                })
              )}
            </div>
          ) : filter.field === "country" ? (
            <div className="flex-1 min-w-[220px] flex flex-wrap gap-2">
              {(fieldValues.country ?? []).length === 0 ? (
                <span className="font-body text-xs text-pz-on-surface-variant">No countries seen in imported contacts yet.</span>
              ) : (
                (fieldValues.country ?? []).map((v) => {
                  const checked = filter.values.includes(v);
                  return (
                    <label key={v} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-pz-outline-variant text-xs font-body cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          patch(index, {
                            ...filter,
                            values: e.target.checked ? [...filter.values, v] : filter.values.filter((x) => x !== v),
                          } as SegmentFilter)
                        }
                      />
                      {v}
                    </label>
                  );
                })
              )}
            </div>
          ) : filter.field === "discovery_source" ? (
            <div className="flex-1 min-w-[220px] flex flex-wrap gap-2">
              {DISCOVERY_SOURCE_OPTIONS.map((v) => {
                const checked = filter.values.includes(v);
                return (
                  <label key={v} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-pz-outline-variant text-xs font-body cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        patch(index, {
                          ...filter,
                          values: e.target.checked ? [...filter.values, v] : filter.values.filter((x) => x !== v),
                        } as SegmentFilter)
                      }
                    />
                    {v}
                  </label>
                );
              })}
            </div>
          ) : filter.field === "row_type" ? (
            <select
              value={filter.value}
              onChange={(e) => patch(index, { ...filter, value: e.target.value } as SegmentFilter)}
              className="rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
            >
              {ROW_TYPE_OPTIONS.map((v) => (
                <option key={v} value={v}>{v.replace("_", " ")}</option>
              ))}
            </select>
          ) : typeof filter.value === "boolean" ? (
            <select
              value={String(filter.value)}
              onChange={(e) => patch(index, { ...filter, value: e.target.value === "true" } as SegmentFilter)}
              className="rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
            >
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <>
              <input
                value={String(filter.value)}
                onChange={(e) =>
                  patch(index, {
                    ...filter,
                    value: typeof filter.value === "number" ? Number(e.target.value) || 0 : e.target.value,
                  } as SegmentFilter)
                }
                list={(OPEN_VOCAB_FIELDS as readonly string[]).includes(filter.field) ? `${filter.field}-values` : undefined}
                className="flex-1 min-w-[140px] rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
              />
              {(OPEN_VOCAB_FIELDS as readonly string[]).includes(filter.field) && (
                <datalist id={`${filter.field}-values`}>
                  {(fieldValues[filter.field] ?? []).map((v) => <option key={v} value={v} />)}
                </datalist>
              )}
            </>
          )}

          <button
            onClick={() => update(value.filter((_, i) => i !== index))}
            className="text-pz-danger font-body text-sm"
          >
            remove
          </button>
        </div>
      ))}

      {samples.length > 0 && (
        <p className="font-body text-xs text-pz-on-surface-variant">
          e.g. {samples.map((s) => s.fullName || s.email || s.phoneE164).join(", ")}
        </p>
      )}
    </div>
  );
}
