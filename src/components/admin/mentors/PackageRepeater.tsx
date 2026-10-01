"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MentorPackage } from "@/lib/data/mentors";

const fieldClass =
  "w-full border border-pz-outline-variant rounded-lg px-2.5 py-2 text-sm max-md:text-base font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

interface Row extends MentorPackage {
  key: string;
}

/** See StringListRepeater's comment for why every row carries a client-only _key. */
export function PackageRepeater({
  value,
  onChange,
}: {
  value: MentorPackage[];
  onChange: (next: MentorPackage[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => value.map((v) => ({ key: crypto.randomUUID(), ...v })));

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map(({ key: _key, ...rest }) => rest));
  }

  function update(key: string, patch: Partial<MentorPackage>) {
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-2 sm:grid-cols-[1fr_90px_120px_120px_auto] gap-2 items-center bg-pz-surface-container-low p-3 rounded-lg"
        >
          <input
            type="text"
            value={row.name}
            onChange={(e) => update(row.key, { name: e.target.value })}
            placeholder="Package name"
            className={`${fieldClass} col-span-2 sm:col-span-1`}
          />
          <input
            type="number"
            min={1}
            value={row.sessions}
            onChange={(e) => update(row.key, { sessions: Number(e.target.value) || 1 })}
            placeholder="Sessions"
            className={fieldClass}
          />
          <input
            type="number"
            min={0}
            value={row.price}
            onChange={(e) => update(row.key, { price: Number(e.target.value) || 0 })}
            placeholder="Price (PKR)"
            className={fieldClass}
          />
          <input
            type="number"
            min={0}
            value={row.savings ?? ""}
            onChange={(e) => update(row.key, { savings: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="Savings (opt.)"
            className={fieldClass}
          />
          <button
            type="button"
            onClick={() => commit(rows.filter((r) => r.key !== row.key))}
            className="shrink-0 p-2 text-pz-on-surface-variant hover:text-pz-danger transition-colors justify-self-end"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => commit([...rows, { key: crypto.randomUUID(), name: "", sessions: 1, price: 0 }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-pz-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Package
      </button>
    </div>
  );
}
