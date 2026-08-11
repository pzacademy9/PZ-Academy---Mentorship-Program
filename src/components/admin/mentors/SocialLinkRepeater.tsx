"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MentorSocialLink } from "@/lib/data/mentors";

const fieldClass =
  "w-full border border-pz-outline-variant rounded-lg px-2.5 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

interface Row extends MentorSocialLink {
  key: string;
}

/** See StringListRepeater's comment for why every row carries a client-only _key. */
export function SocialLinkRepeater({
  value,
  onChange,
}: {
  value: MentorSocialLink[];
  onChange: (next: MentorSocialLink[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => value.map((v) => ({ key: crypto.randomUUID(), ...v })));

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map(({ key: _key, ...rest }) => rest));
  }

  function update(key: string, patch: Partial<MentorSocialLink>) {
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[130px_1fr_auto] gap-2 items-center">
          <input
            type="text"
            value={row.label}
            onChange={(e) => update(row.key, { label: e.target.value })}
            placeholder="Label"
            className={fieldClass}
          />
          <input
            type="text"
            value={row.url}
            onChange={(e) => update(row.key, { url: e.target.value })}
            placeholder="https://..."
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
        onClick={() => commit([...rows, { key: crypto.randomUUID(), label: "", url: "" }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-pz-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Link
      </button>
    </div>
  );
}
