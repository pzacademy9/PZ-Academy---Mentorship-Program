"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MentorCredential } from "@/lib/data/mentors";
import { CREDENTIAL_ICONS } from "@/lib/validations/admin-mentor";

const fieldClass =
  "w-full border border-pz-outline-variant rounded-lg px-2.5 py-2 text-sm max-md:text-base font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

interface Row extends MentorCredential {
  key: string;
}

/** See StringListRepeater's comment for why every row carries a client-only _key. */
export function CredentialRepeater({
  value,
  onChange,
}: {
  value: MentorCredential[];
  onChange: (next: MentorCredential[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => value.map((v) => ({ key: crypto.randomUUID(), ...v })));

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map(({ key: _key, ...rest }) => rest));
  }

  function update(key: string, patch: Partial<MentorCredential>) {
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_130px_auto] gap-2 items-center bg-pz-surface-container-low p-3 rounded-lg"
        >
          <input
            type="text"
            value={row.title}
            onChange={(e) => update(row.key, { title: e.target.value })}
            placeholder="Credential title"
            className={fieldClass}
          />
          <input
            type="text"
            value={row.institution}
            onChange={(e) => update(row.key, { institution: e.target.value })}
            placeholder="Institution"
            className={fieldClass}
          />
          <select
            value={row.icon}
            onChange={(e) => update(row.key, { icon: e.target.value })}
            className={fieldClass}
          >
            {CREDENTIAL_ICONS.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
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
        onClick={() => commit([...rows, { key: crypto.randomUUID(), title: "", institution: "", icon: CREDENTIAL_ICONS[0] }])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-pz-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Credential
      </button>
    </div>
  );
}
