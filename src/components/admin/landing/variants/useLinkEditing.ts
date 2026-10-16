"use client";

import { useCallback, useRef, useState } from "react";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { findOrphans } from "@/lib/landing/resolve-variant";
import { variantPath, type VariantOverrides, type VariantRef } from "@/lib/landing/variants";
import type { LandingContent, LandingSection, Problem } from "@/lib/landing/content";
import type { LandingVariant, LandingVariantVersion } from "@/lib/data/landing-variants";
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

/** Same overrides regardless of key order (the database stores JSON with its own key order). */
export function sameOverrides(a: VariantOverrides | null, b: VariantOverrides | null): boolean {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/** "Editing:" options: the main page plus every turned-on link; none at all while no link is on. */
export function switcherOptions(grid: VariantGridRow[]): VariantOption[] {
  const on = grid.filter((r) => r.enabled && r.variantId);
  return on.length === 0 ? [] : [{ id: null, label: "Main page" }, ...on.map((r) => ({ id: r.variantId, label: r.label }))];
}

// ---- the hook ----

export type PublishOutcome = { ok: true } | { ok: false; problems?: Problem[]; error?: string };

const NETWORK = "Could not reach the server. Please try again.";

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

/**
 * The page's country / module links, which one the editor is on ("Main page" = null), and each link's
 * own edits. Each link autosaves to its own PATCH route with its own revision; switching links first
 * saves what is pending. The Links panel's changes (turned on/off, created, published, restored) land
 * here, so the switcher and the editor stay in step without a reload.
 */
export function useLinkEditing({
  pageId, variants: initial, confirmDiscard,
}: {
  pageId: string;
  variants: LandingVariant[];
  /** Asked when the current link's changes could not be saved before switching. */
  confirmDiscard: () => Promise<boolean>;
}) {
  const base = `/api/admin/landing-pages/${pageId}/variants`;
  const [variants, setVariants] = useState<LandingVariant[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overridesById, setOverridesById] = useState<Record<string, VariantOverrides>>(
    () => Object.fromEntries(initial.map((v) => [v.id, v.draft])),
  );
  const overridesRef = useRef(overridesById);
  const revisions = useRef<Record<string, number>>(Object.fromEntries(initial.map((v) => [v.id, v.revision])));
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  // The server's not-ready list per link after a refused publish; cleared by the link's next edit.
  const [problems, setProblems] = useState<Record<string, Problem[]>>({});

  const onRevision = useCallback((rev: number) => {
    const id = activeRef.current;
    if (id) revisions.current[id] = rev;
  }, []);
  const { state: saveState, schedule, saveNow, restart } = useAutosaveDraft<VariantOverrides>({
    endpoint: `${base}/${activeId ?? "none"}`,
    bodyKey: "overrides",
    initialRevision: activeId ? revisions.current[activeId] ?? 1 : 1,
    onRevision,
  });

  const active = activeId ? variants.find((v) => v.id === activeId) ?? null : null;
  const overrides = activeId ? overridesById[activeId] ?? { sections: {} } : null;

  const setProblemsFor = useCallback((id: string, list: Problem[] | null) => {
    setProblems((p) => {
      if (!list && !own(p, id)) return p;
      const next = { ...p };
      if (list) next[id] = list; else delete next[id];
      return next;
    });
  }, []);

  /**
   * Applies an edit to link `linkId`'s overrides and autosaves it. `linkId` is the link that was open
   * when the edit's handler was created: an edit that lands after the admin switched links (a slow
   * image upload) is dropped rather than written into, or saved over, another link.
   */
  const update = useCallback((fn: (ov: VariantOverrides) => VariantOverrides, linkId: string | null) => {
    const id = activeRef.current;
    if (!id || id !== linkId) return;
    const next = fn(overridesRef.current[id] ?? { sections: {} });
    overridesRef.current = { ...overridesRef.current, [id]: next };
    setOverridesById(overridesRef.current);
    setProblemsFor(id, null);
    schedule(next);
  }, [schedule, setProblemsFor]);

  const switchTo = useCallback(async (id: string | null) => {
    if (id === activeRef.current) return true;
    if (activeRef.current) {
      const ok = (await saveNow()) || (await confirmDiscard());
      if (!ok) return false;
    }
    setActiveId(id);
    return true;
  }, [saveNow, confirmDiscard]);

  /**
   * Takes in a link as the server has it. Its draft replaces this editor's copy only when the editor
   * has none yet, or when `restored` (the server's draft was replaced by an older version).
   */
  const sync = useCallback((v: LandingVariant, restored = false) => {
    setVariants((list) => (list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v]));
    if (restored || !own(overridesRef.current, v.id)) {
      overridesRef.current = { ...overridesRef.current, [v.id]: v.draft };
      setOverridesById(overridesRef.current);
      revisions.current[v.id] = v.revision;
      if (restored && activeRef.current === v.id) restart(v.revision);
    }
  }, [restart]);

  const change = useCallback((id: string, patch: Partial<LandingVariant>) => {
    setVariants((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  /**
   * Turns a link on or off. An existing link is switched with PATCH { enabled }; a link that does not
   * exist yet is created (POST) after the main page's pending edits are saved, because the server
   * checks the country / module against the saved main page. Returns an error message or null.
   */
  const setLinkOn = useCallback(async (
    ref: VariantRef, variantId: string | null, on: boolean, saveMain: () => Promise<boolean>,
  ): Promise<string | null> => {
    try {
      let id = variantId;
      if (!id) {
        if (!on) return null;
        if (!(await saveMain())) return "Your latest changes to the page could not be saved. Try again.";
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regionKey: ref.regionKey, moduleKey: ref.moduleKey, enabled: true }),
        });
        const payload = await readJson<{ variant?: LandingVariant; error?: string }>(res);
        if (!res.ok || !payload?.variant) return payload?.error ?? "Could not turn this link on. Please try again.";
        sync(payload.variant);
        // Someone else made this link already (and it is off): the create returned it unchanged.
        if (payload.variant.enabled) return null;
        id = payload.variant.id;
      }
      if (!on && activeRef.current === id && !(await switchTo(null))) return null;
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: on }),
      });
      if (!res.ok) {
        const payload = await readJson<{ error?: string }>(res);
        return payload?.error ?? `Could not turn this link ${on ? "on" : "off"}. Please try again.`;
      }
      change(id, { enabled: on });
      return null;
    } catch {
      return NETWORK;
    }
  }, [base, sync, change, switchTo]);

  /** Publishes link `id` (saving the open link's edits first). */
  const publish = useCallback(async (id: string): Promise<PublishOutcome> => {
    if (activeRef.current === id && !(await saveNow())) {
      return { ok: false, error: "Your latest changes could not be saved. Try again." };
    }
    // What the server is about to publish: edits typed while the request is on its way are not in it.
    const snapshot = overridesRef.current[id] ?? { sections: {} };
    try {
      const res = await fetch(`${base}/${id}/publish`, { method: "POST" });
      if (res.ok) {
        setProblemsFor(id, null);
        change(id, { published: snapshot, publishedAt: new Date().toISOString() });
        return { ok: true };
      }
      const payload = await readJson<{ error?: string; problems?: Problem[] }>(res);
      if (res.status === 422 && Array.isArray(payload?.problems)) {
        setProblemsFor(id, payload.problems);
        return { ok: false, problems: payload.problems };
      }
      return { ok: false, error: payload?.error ?? "Could not publish this link. Please try again." };
    } catch {
      return { ok: false, error: NETWORK };
    }
  }, [base, saveNow, change, setProblemsFor]);

  /** Link `id`'s published versions, newest first; null when they could not be loaded. */
  const loadVersions = useCallback(async (id: string): Promise<LandingVariantVersion[] | null> => {
    try {
      const res = await fetch(`${base}/${id}/versions`);
      if (!res.ok) return null;
      const payload = await readJson<{ versions?: LandingVariantVersion[] }>(res);
      return Array.isArray(payload?.versions) ? payload.versions : null;
    } catch {
      return null;
    }
  }, [base]);

  /**
   * Restores a published version of link `id` (its live version and its draft). Pending edits to the
   * link are dropped on purpose, as on the main page. Returns an error message or null.
   */
  const restore = useCallback(async (id: string, version: number): Promise<string | null> => {
    // Never race a save of this link: a PATCH landing after the rollback would overwrite the restored
    // draft. Its result does not matter, the restore replaces the draft either way.
    if (activeRef.current === id) await saveNow();
    try {
      const res = await fetch(`${base}/${id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) {
        const payload = await readJson<{ error?: string; code?: string }>(res);
        if (res.status === 409 || payload?.code === "conflict") return "Someone else changed this link. Reload and try again.";
        return payload?.error ?? "Could not restore that version. Please try again.";
      }
      const listRes = await fetch(base);
      const list = listRes.ok ? await readJson<{ variants?: LandingVariant[] }>(listRes) : null;
      const fresh = list?.variants?.find((v) => v.id === id);
      if (!fresh) return "The version was restored, but the editor could not load it. Reload the page to see it.";
      setProblemsFor(id, null);
      sync(fresh, true);
      return null;
    } catch {
      return NETWORK;
    }
  }, [base, sync, setProblemsFor, saveNow]);

  return {
    variants, activeId, active, overrides, problems,
    path: active ? variantPath(active.ref) : undefined,
    saveState, saveNow,
    update, switchTo,
    setLinkOn, publish, loadVersions, restore,
  };
}
