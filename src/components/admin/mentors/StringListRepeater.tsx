"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

/**
 * Shared repeater for both bio paragraphs (fullBio, multiline) and skills
 * (single-line). Rows carry a client-only `_key` generated once on mount so
 * React keys stay stable across add/edit/delete — using the array index as
 * the key instead makes React reuse DOM nodes on delete, which is what
 * causes text typed into row 2 to visually "jump" into row 1 after row 1 is
 * removed. `_key` never leaves this component: onChange only ever receives
 * the plain string array.
 */
export function StringListRepeater({
  value,
  onChange,
  placeholder,
  multiline = false,
  addLabel = "Add",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  addLabel?: string;
}) {
  const [rows, setRows] = useState(() => value.map((v) => ({ key: crypto.randomUUID(), value: v })));

  function commit(next: { key: string; value: string }[]) {
    setRows(next);
    onChange(next.map((r) => r.value));
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2">
          {multiline ? (
            <textarea
              value={row.value}
              onChange={(e) => commit(rows.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))}
              placeholder={placeholder}
              rows={3}
              className="flex-1 border border-pz-outline-variant rounded-lg px-3 py-2 text-sm max-md:text-base font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            />
          ) : (
            <input
              type="text"
              value={row.value}
              onChange={(e) => commit(rows.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))}
              placeholder={placeholder}
              className="flex-1 border border-pz-outline-variant rounded-lg px-3 py-2 text-sm max-md:text-base font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            />
          )}
          <button
            type="button"
            onClick={() => commit(rows.filter((r) => r.key !== row.key))}
            className="shrink-0 p-2 text-pz-on-surface-variant hover:text-pz-danger transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => commit([...rows, { key: crypto.randomUUID(), value: "" }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-pz-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );
}
