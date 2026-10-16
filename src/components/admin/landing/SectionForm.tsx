"use client";

import { SECTION_DEFS, type SectionType } from "@/lib/landing/sections";
import type { ModuleDef } from "@/lib/landing/variants";
import { FieldInput } from "./FieldInput";
import { OverrideBadge } from "./variants/OverrideBadge";

/** While a country / module link is being edited: each field is saved on its own, for that link. */
export interface LinkFieldEditing {
  /** Top-level field keys this link has its own value for. */
  overridden: ReadonlySet<string>;
  onFieldChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
}

/** The guided form for one section. Every edit reports the FULL data object (or one field, on a link). */
export function SectionForm({
  type, data, onChange, modules, link,
}: {
  type: SectionType; data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void; modules?: ModuleDef[];
  link?: LinkFieldEditing;
}) {
  const def = SECTION_DEFS[type];
  return (
    <div className="space-y-5">
      {def.fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          {link && <OverrideBadge overridden={link.overridden.has(f.key)} onReset={() => link.onReset(f.key)} />}
          <FieldInput
            field={f}
            path={f.key}
            modules={modules}
            value={data[f.key]}
            onChange={(v) => (link ? link.onFieldChange(f.key, v) : onChange({ ...data, [f.key]: v }))}
          />
        </div>
      ))}
    </div>
  );
}
