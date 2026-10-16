"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { findOrphans } from "@/lib/landing/resolve-variant";
import { variantPath, type VariantOverrides } from "@/lib/landing/variants";
import type { LandingContent, LandingSection } from "@/lib/landing/content";
import type { LandingVariant } from "@/lib/data/landing-variants";
import type { VariantGridRow } from "@/lib/landing/variant-grid";
import type { VariantOption } from "./VariantSwitcher";

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// ---- pure helpers (never mutate their input) ----

type SectionOv = VariantOverrides["sections"][string];

function withSection(ov: VariantOverrides, id: string, next: SectionOv | null): VariantOverrides {
  const sections = { ...ov.sections };
  if (next && (next.hidden || (next.fields && Object.keys(next.fields).length > 0))) sections[id] = next;
  else delete sections[id];
  return { ...ov, sections };
}

export function setOverrideField(ov: VariantOverrides, id: string, key: string, value: unknown): VariantOverrides {
  const cur = own(ov.sections, id) ? ov.sections[id] : {};
  return withSection(ov, id, { ...cur, fields: { ...(cur.fields ?? {}), [key]: value } });
}

export function resetOverrideField(ov: VariantOverrides, id: string, key: string): VariantOverrides {
  if (!own(ov.sections, id)) return ov;
  const cur = ov.sections[id];
  const fields = { ...(cur.fields ?? {}) };
  delete fields[key];
  const next: SectionOv = { ...cur };
  if (Object.keys(fields).length > 0) next.fields = fields; else delete next.fields;
  return withSection(ov, id, next);
}

export function setOverrideHidden(ov: VariantOverrides, id: string, hidden: boolean): VariantOverrides {
  const cur = own(ov.sections, id) ? ov.sections[id] : {};
  const next: SectionOv = { ...cur };
  if (hidden) next.hidden = true; else delete next.hidden;
  return withSection(ov, id, next);
}

/** Section ids in the order this link shows them (same rule as resolveVariant). */
export function linkOrder(main: LandingContent, ov: VariantOverrides): string[] {
  const ids = main.sections.map((s) => s.id);
  if (!ov.order) return ids;
  const known = new Set(ids);
  const listed = Array.from(new Set(ov.order)).filter((id) => known.has(id));
  const set = new Set(listed);
  return [...listed, ...ids.filter((id) => !set.has(id))];
}

export function moveOnLink(main: LandingContent, ov: VariantOverrides, id: string, dir: -1 | 1): VariantOverrides {
  const order = linkOrder(main, ov);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return ov;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...ov, order };
}

export function removeOrphans(main: LandingContent, ov: VariantOverrides): VariantOverrides {
  const { sectionIds, fields } = findOrphans(main, ov);
  let next: VariantOverrides = { ...ov, sections: { ...ov.sections } };
  for (const id of sectionIds) delete next.sections[id];
  for (const f of fields) next = resetOverrideField(next, f.sectionId, f.field);
  if (next.order) {
    const known = new Set(main.sections.map((s) => s.id));
    next.order = next.order.filter((id) => known.has(id));
  }
  return next;
}

/** The sections as the form shows them on a link: main's values, with this link's own fields on top. */
export function linkSections(main: LandingContent, ov: VariantOverrides): LandingSection[] {
  const byId = new Map(main.sections.map((s) => [s.id, s]));
  return linkOrder(main, ov).map((id) => {
    const s = byId.get(id)!;
    const o = own(ov.sections, id) ? ov.sections[id] : undefined;
    if (!o) return s;
    const keys = new Set(SECTION_DEFS[s.type].fields.map((f) => f.key));
    const data = { ...s.data };
    for (const [k, v] of Object.entries(o.fields ?? {})) if (keys.has(k)) data[k] = v;
    return { ...s, data, enabled: s.enabled && !o.hidden };
  });
}

// ---- the hook ----

/**
 * Which link the editor is on ("Main page" = null) and that link's own edits. Each link autosaves to
 * its own PATCH route with its own revision; switching links first saves what is pending.
 */
export function useLinkEditing({
  pageId, variants, grid, confirmDiscard,
}: {
  pageId: string;
  variants: LandingVariant[];
  grid: VariantGridRow[];
  /** Asked when the current link's changes could not be saved before switching. */
  confirmDiscard: () => Promise<boolean>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overridesById, setOverridesById] = useState<Record<string, VariantOverrides>>(
    () => Object.fromEntries(variants.map((v) => [v.id, v.draft])),
  );
  const overridesRef = useRef(overridesById);
  const revisions = useRef<Record<string, number>>(Object.fromEntries(variants.map((v) => [v.id, v.revision])));
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const onRevision = useCallback((rev: number) => {
    const id = activeRef.current;
    if (id) revisions.current[id] = rev;
  }, []);
  const { state: saveState, schedule, saveNow } = useAutosaveDraft<VariantOverrides>({
    endpoint: `/api/admin/landing-pages/${pageId}/variants/${activeId ?? "none"}`,
    bodyKey: "overrides",
    initialRevision: activeId ? revisions.current[activeId] ?? 1 : 1,
    onRevision,
  });

  const options = useMemo<VariantOption[]>(() => {
    const on = grid.filter((r) => r.enabled && r.variantId && variants.some((v) => v.id === r.variantId));
    return on.length === 0 ? [] : [{ id: null, label: "Main page" }, ...on.map((r) => ({ id: r.variantId, label: r.label }))];
  }, [grid, variants]);

  const active = activeId ? variants.find((v) => v.id === activeId) ?? null : null;
  const overrides = activeId ? overridesById[activeId] ?? { sections: {} } : null;

  /** Applies an edit to the current link's overrides and autosaves it. */
  const update = useCallback((fn: (ov: VariantOverrides) => VariantOverrides) => {
    const id = activeRef.current;
    if (!id) return;
    const next = fn(overridesRef.current[id] ?? { sections: {} });
    overridesRef.current = { ...overridesRef.current, [id]: next };
    setOverridesById(overridesRef.current);
    schedule(next);
  }, [schedule]);

  const switchTo = useCallback(async (id: string | null) => {
    if (id === activeRef.current) return;
    if (activeRef.current) {
      const ok = (await saveNow()) || (await confirmDiscard());
      if (!ok) return;
    }
    setActiveId(id);
  }, [saveNow, confirmDiscard]);

  return {
    options, activeId, active, overrides,
    path: active ? variantPath(active.ref) : undefined,
    label: options.find((o) => o.id === activeId)?.label ?? "",
    saveState, saveNow,
    update, switchTo,
  };
}
