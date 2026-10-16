"use client";

import { useId, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MAX_MODULES, type ModuleDef } from "@/lib/landing/variants";
import { moduleKeyProblem, nextModuleKey } from "@/lib/landing/link-names";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { CONTROL, HELP, ICON_BTN, LABEL } from "./registration/styles";

export interface ModulesEditorProps {
  modules: ModuleDef[];
  registration: RegistrationConfig;
  slug?: string;
  /**
   * Module link names of every link the page has, including links of modules since removed. A module
   * with a link keeps its name (its web address would break), and no new module may take one of these.
   */
  lockedKeys: string[];
  onModules: (modules: ModuleDef[]) => void;
  onRename: (from: string, to: string) => void;
}

/** Page settings > Modules (course and workshop pages): parts of the course sold on their own. */
export function ModulesEditor({ modules, registration, slug, lockedKeys, onModules, onRename }: ModulesEditorProps) {
  const headingId = useId();
  const confirm = useConfirm();
  // What the admin is typing in a Link name field while it is not a valid name yet (by module index).
  const [typed, setTyped] = useState<Record<number, string>>({});
  const names = { modules, registration };
  const moduleOptions = registration.options.filter((o) => o.kind === "module");

  const set = (i: number, patch: Partial<ModuleDef>) => onModules(modules.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  function add() {
    if (modules.length >= MAX_MODULES) return;
    onModules([...modules, { key: nextModuleKey(names, lockedKeys), title: "", format: "", days: 0, optionKey: "" }]);
  }

  async function remove(i: number) {
    const m = modules[i];
    if (lockedKeys.includes(m.key)) {
      const ok = await confirm({
        title: `Remove ${m.title.trim() || "this module"}?`,
        description: "This module's links stop working once it is removed.",
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
    }
    setTyped({});
    onModules(modules.filter((_, j) => j !== i));
  }

  function rename(i: number, value: string) {
    const problem = moduleKeyProblem(value, names, i, lockedKeys);
    if (problem) { setTyped((t) => ({ ...t, [i]: value })); return; }
    setTyped((t) => { const n = { ...t }; delete n[i]; return n; });
    onRename(modules[i].key, value);
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
      <div className="space-y-1">
        <h3 id={headingId} className="flex items-center gap-2 font-headline text-sm font-bold text-pz-on-surface">
          <Layers className="h-4 w-4 text-pz-on-surface-variant" aria-hidden="true" />
          Modules
        </h3>
        <p className={HELP}>Parts of this course that people can buy on their own. Each module can have its own link (see Links).</p>
      </div>

      {modules.length === 0 && <p className={HELP}>No modules yet. The whole course is sold as one.</p>}

      {modules.map((m, i) => {
        const shown = typed[i] ?? m.key;
        const problem = typed[i] !== undefined ? moduleKeyProblem(typed[i], names, i, lockedKeys) : null;
        const locked = lockedKeys.includes(m.key);
        return (
          <fieldset key={i} className="relative space-y-3 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3">
            <legend className={`float-left pr-12 ${LABEL}`}>{m.title.trim() || `Module ${i + 1}`}</legend>
            <button type="button" aria-label={`Remove ${m.title.trim() || `module ${i + 1}`}`} className={`absolute right-2 top-2 ${ICON_BTN}`} onClick={() => void remove(i)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="clear-left grid gap-3 pt-1 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className={LABEL}>Module title</span>
                <input maxLength={120} placeholder="Diabetes management" value={m.title} onChange={(e) => set(i, { title: e.target.value })} className={CONTROL} />
              </label>
              <label className="space-y-1">
                <span className={LABEL}>Format</span>
                <input maxLength={60} placeholder="3-Day Workshop" value={m.format} onChange={(e) => set(i, { format: e.target.value })} className={CONTROL} />
              </label>
              <label className="space-y-1">
                <span className={LABEL}>Days</span>
                <input
                  type="number" inputMode="numeric" min={0} max={60} step={1}
                  value={String(m.days)}
                  onChange={(e) => { const n = Number(e.target.value); set(i, { days: Number.isFinite(n) ? Math.min(60, Math.max(0, Math.round(n))) : 0 }); }}
                  className={CONTROL}
                />
              </label>
              <div className="space-y-1 sm:col-span-2">
                <label className="block space-y-1">
                  <span className={LABEL}>Sold as</span>
                  <select value={m.optionKey} onChange={(e) => set(i, { optionKey: e.target.value })} className={CONTROL}>
                    <option value="">Not linked yet</option>
                    {moduleOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
                {moduleOptions.length === 0 && (
                  <p className={HELP}>Add a module option in Registration setup, then choose it here so this module&apos;s link can take registrations.</p>
                )}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="block space-y-1">
                  <span className={LABEL}>Link name</span>
                  <input
                    maxLength={40}
                    value={shown}
                    readOnly={locked}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${headingId}-k${i}`}
                    onChange={(e) => rename(i, e.target.value)}
                    className={`${CONTROL} read-only:opacity-70`}
                  />
                </label>
                <p id={`${headingId}-k${i}`} className={HELP}>
                  {locked
                    ? "This module already has a link, so its link name stays the same."
                    : `The end of this module's web address: /e/${slug ?? "your-page"}/${shown || "…"}`}
                </p>
                {problem && <p role="alert" className="font-body text-xs font-semibold text-pz-danger">{problem}</p>}
              </div>
            </div>
          </fieldset>
        );
      })}

      {modules.length < MAX_MODULES && (
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-2 font-body text-sm font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add module
        </button>
      )}
    </section>
  );
}
