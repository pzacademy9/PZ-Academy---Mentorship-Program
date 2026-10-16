"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isSafeUrl, youtubeId } from "@/lib/landing/simple-text";
import type { FieldDef } from "@/lib/landing/sections";
import type { ModuleDef } from "@/lib/landing/variants";
import { LandingImageField } from "./LandingImageField";

type Item = Record<string, unknown>;

const LABEL = "font-body text-sm font-semibold text-pz-on-surface";
const HELP = "font-body text-xs text-pz-on-surface-variant";
const ERROR = "font-body text-xs font-medium text-pz-danger";
const CONTROL =
  "w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/60 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base";
const ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-pz-outline-variant text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 max-md:w-11";

function defaultItem(field: FieldDef): Item {
  return Object.fromEntries((field.itemFields ?? []).map((f) => [f.key, f.defaultValue ?? (f.kind === "list" ? [] : "")]));
}

function RequiredMarker() {
  return (
    <span className="rounded-full bg-pz-secondary-container px-2 py-0.5 font-headline text-[11px] font-semibold text-pz-on-secondary-container">
      Required to publish
    </span>
  );
}

/** Plain-language problem with the current value, or null. Never used to block typing. */
function problemFor(field: FieldDef, value: string): string | null {
  if (value === "") return null;
  if (field.kind === "url" && !isSafeUrl(value)) return "Enter a full link starting with https://";
  if (field.kind === "youtube" && !youtubeId(value)) return "That doesn't look like a YouTube link. Paste the YouTube or YouTube Shorts link.";
  if ((field.kind === "text" || field.kind === "textarea") && field.max && value.length > field.max) {
    return `This is ${value.length - field.max} characters too long. Please keep it under ${field.max} characters.`;
  }
  return null;
}

/** `path` locates the control for the checklist's Fix button: "headline", or "items.0.q" inside a list. */
export function FieldInput({ field, value, onChange, path, modules }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; path?: string; modules?: ModuleDef[] }) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;

  if (field.kind === "list") return <ListField field={field} value={value} onChange={onChange} path={path ?? field.key} modules={modules} />;

  if (field.kind === "module") {
    // Pages without modules edit exactly as before: no select at all.
    if (!modules || modules.length === 0) return null;
    const current = typeof value === "string" ? value : "";
    const known = modules.some((m) => m.key === current);
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className={LABEL}>{field.label}</label>
        <select id={id} value={current} data-field-path={path} onChange={(e) => onChange(e.target.value)} className={cn(CONTROL, "h-auto")}>
          <option value="">All modules</option>
          {!known && current !== "" && <option value={current}>{current} (removed module)</option>}
          {modules.map((m) => <option key={m.key} value={m.key}>{m.title.trim() === "" ? m.key : m.title}</option>)}
        </select>
      </div>
    );
  }

  const str = typeof value === "string" ? value : "";
  const problem = field.kind === "image" ? null : problemFor(field, str);
  const describedBy = [field.help ? helpId : null, problem ? errId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {field.kind === "image" ? (
          <span id={`${id}-label`} className={LABEL}>{field.label}</span>
        ) : (
          <label htmlFor={id} className={LABEL}>{field.label}</label>
        )}
        {field.required && str.trim() === "" && <RequiredMarker />}
      </div>
      {field.help && <p id={helpId} className={HELP}>{field.help}</p>}
      {field.kind === "image" ? (
        <LandingImageField
          value={str}
          onChange={(v) => onChange(v)}
          labelledBy={`${id}-label`}
          describedBy={field.help ? helpId : undefined}
          path={path}
        />
      ) : field.kind === "textarea" ? (
        <textarea
          id={id}
          rows={4}
          value={str}
          placeholder={field.example}
          aria-describedby={describedBy}
          aria-invalid={problem ? true : undefined}
          data-field-path={path}
          onChange={(e) => onChange(e.target.value)}
          className={cn(CONTROL, "min-h-[6rem] resize-y")}
        />
      ) : (
        <Input
          id={id}
          type={field.kind === "url" || field.kind === "youtube" ? "url" : "text"}
          value={str}
          placeholder={field.example}
          aria-describedby={describedBy}
          aria-invalid={problem ? true : undefined}
          data-field-path={path}
          onChange={(e) => onChange(e.target.value)}
          className={cn(CONTROL, "h-auto")}
        />
      )}
      {problem && <p id={errId} role="alert" className={ERROR}>{problem}</p>}
    </div>
  );
}

function ListField({ field, value, onChange, path, modules }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; path: string; modules?: ModuleDef[] }) {
  const items: Item[] = Array.isArray(value) ? (value as Item[]) : [];
  const itemLabel = field.itemLabel ?? "Item";
  const max = field.maxItems ?? 40;
  const set = (next: Item[]) => onChange(next);
  const add = () => set([...items, defaultItem(field)]);
  const remove = (i: number) => set(items.filter((_, n) => n !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const edit = (i: number, key: string, v: unknown) => set(items.map((it, n) => (n === i ? { ...it, [key]: v } : it)));

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{field.label}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={LABEL} aria-hidden="true">
          {field.label} <span className="font-normal text-pz-on-surface-variant">({items.length} total)</span>
        </h3>
        {field.required && items.length === 0 && <RequiredMarker />}
      </div>
      {field.help && <p className={HELP}>{field.help}</p>}
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 font-headline text-sm font-bold text-pz-on-surface">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pz-solid-forest text-xs text-white" aria-hidden="true">{i + 1}</span>
                {itemLabel} {i + 1}
              </span>
              <span className="flex items-center gap-1.5">
                <button type="button" className={ICON_BTN} aria-label={`Move ${itemLabel} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className={ICON_BTN} aria-label={`Move ${itemLabel} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className={cn(ICON_BTN, "hover:text-pz-danger")} aria-label={`Remove ${itemLabel} ${i + 1}`} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </div>
            <div className="space-y-3">
              {(field.itemFields ?? []).map((f) => (
                <FieldInput key={f.key} field={f} path={`${path}.${i}.${f.key}`} value={item[f.key]} onChange={(v) => edit(i, f.key, v)} modules={modules} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-field-path={path}
        onClick={add}
        disabled={items.length >= max}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-pz-outline-variant px-3 py-2.5 font-body text-sm font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100 disabled:text-pz-on-surface-variant/60 max-md:min-h-11"
        aria-label={`Add ${itemLabel.toLowerCase()}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add {itemLabel.toLowerCase()}
        {items.length >= max && <span className="font-normal">(limit of {max} reached)</span>}
      </button>
    </fieldset>
  );
}
