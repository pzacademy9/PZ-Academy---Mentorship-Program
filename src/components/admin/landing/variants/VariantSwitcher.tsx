"use client";

import { useId } from "react";

export interface VariantOption { id: string | null; label: string }

/** "Editing: Main page / UAE / Module 2". Only shown when the page has at least one turned-on link. */
export function VariantSwitcher({
  options, value, onChange, disabled,
}: { options: VariantOption[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="font-body text-xs font-semibold text-pz-on-surface-variant">Editing:</label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="max-w-[14rem] truncate rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-2 py-1 font-body text-xs font-semibold text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.id ?? ""} value={o.id ?? ""}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
