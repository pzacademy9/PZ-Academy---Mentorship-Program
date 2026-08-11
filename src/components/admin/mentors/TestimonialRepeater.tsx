"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MentorTestimonial } from "@/lib/data/mentors";

const fieldClass =
  "w-full border border-pz-outline-variant rounded-lg px-2.5 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

interface Row extends MentorTestimonial {
  key: string;
}

/** See StringListRepeater's comment for why every row carries a client-only _key. */
export function TestimonialRepeater({
  value,
  onChange,
}: {
  value: MentorTestimonial[];
  onChange: (next: MentorTestimonial[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => value.map((v) => ({ key: crypto.randomUUID(), ...v })));

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map(({ key: _key, ...rest }) => rest));
  }

  function update(key: string, patch: Partial<MentorTestimonial>) {
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key} className="bg-pz-surface-container-low p-3 rounded-lg space-y-2">
          <textarea
            value={row.quote}
            onChange={(e) => update(row.key, { quote: e.target.value })}
            placeholder="Quote"
            rows={2}
            className={fieldClass}
          />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input
              type="text"
              value={row.author}
              onChange={(e) => update(row.key, { author: e.target.value })}
              placeholder="Author"
              className={fieldClass}
            />
            <input
              type="text"
              value={row.role ?? ""}
              onChange={(e) => update(row.key, { role: e.target.value })}
              placeholder="Role (optional)"
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
        </div>
      ))}
      <button
        type="button"
        onClick={() => commit([...rows, { key: crypto.randomUUID(), quote: "", author: "", role: "" }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-pz-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Testimonial
      </button>
    </div>
  );
}
