"use client";

import { SECTION_DEFS, type SectionType } from "@/lib/landing/sections";
import type { ModuleDef } from "@/lib/landing/variants";
import { FieldInput } from "./FieldInput";

/** The guided form for one section. Every edit reports the FULL data object. */
export function SectionForm({
  type, data, onChange, modules,
}: { type: SectionType; data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void; modules?: ModuleDef[] }) {
  const def = SECTION_DEFS[type];
  return (
    <div className="space-y-5">
      {def.fields.map((f) => (
        <FieldInput key={f.key} field={f} path={f.key} modules={modules} value={data[f.key]} onChange={(v) => onChange({ ...data, [f.key]: v })} />
      ))}
    </div>
  );
}
