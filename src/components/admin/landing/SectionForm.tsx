"use client";

import { SECTION_DEFS, type FieldDef, type SectionType } from "@/lib/landing/sections";
import type { ModuleDef } from "@/lib/landing/variants";
import { FieldInput, type SectionOption } from "./FieldInput";
import { OverrideBadge } from "./variants/OverrideBadge";

/** While a country / module link is being edited: each field is saved on its own, for that link. */
export interface LinkFieldEditing {
  /** Top-level field keys this link has its own value for. */
  overridden: ReadonlySet<string>;
  onFieldChange: (key: string, value: unknown) => void;
  onReset: (key: string) => void;
}

/** A field with a showWhen rule is shown only while the controlling field has that value (its default counts when empty). */
function shows(f: FieldDef, data: Record<string, unknown>, all: FieldDef[]): boolean {
  if (!f.showWhen) return true;
  const raw = data[f.showWhen.key];
  const current = typeof raw === "string" && raw !== "" ? raw : (all.find((x) => x.key === f.showWhen!.key)?.defaultValue ?? "");
  return current === f.showWhen.equals;
}

/** The guided form for one section. Every edit reports the FULL data object (or one field, on a link). */
export function SectionForm({
  type, data, onChange, modules, sections, link,
}: {
  type: SectionType; data: Record<string, unknown>; onChange: (data: Record<string, unknown>) => void; modules?: ModuleDef[]; sections?: SectionOption[];
  link?: LinkFieldEditing;
}) {
  const def = SECTION_DEFS[type];
  return (
    <div className="space-y-5">
      {def.fields.filter((f) => shows(f, data, def.fields)).map((f) => (
        <div key={f.key} className="space-y-1.5">
          {link && <OverrideBadge overridden={link.overridden.has(f.key)} onReset={() => link.onReset(f.key)} />}
          <FieldInput
            field={f}
            path={f.key}
            modules={modules}
            sections={sections}
            value={data[f.key]}
            onChange={(v) => (link ? link.onFieldChange(f.key, v) : onChange({ ...data, [f.key]: v }))}
          />
        </div>
      ))}
    </div>
  );
}
