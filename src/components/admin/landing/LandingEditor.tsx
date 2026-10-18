"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, ExternalLink, LayoutList, Link2, Monitor, PanelLeft, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAutosaveDraft, type SaveState } from "@/hooks/useAutosaveDraft";
import type { LandingPage, LandingVersion } from "@/lib/data/landing-pages";
import {
  addSection, clearReview, computeReadiness, moveSection, removeSection, renameModule, toggleSection, updateModules, updateRegistration,
  updateSectionData, updateSeo, updateSettings,
  type LandingContent, type PageKind, type Problem,
} from "@/lib/landing/content";
import type { PriceCell, RegionDef } from "@/lib/landing/registration/config";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { SectionList } from "./SectionList";
import { SectionForm } from "./SectionForm";
import { PageSettingsPanel } from "./PageSettingsPanel";
import { RegistrationOpsCard } from "./registration/RegistrationOpsCard";
import type { PaymentAccountSummary } from "./registration/RegistrationSetup";
import { parseRegistrationTarget, type RegistrationStepKey } from "@/lib/landing/registration/setup-steps";
import { PreviewFrame } from "./PreviewFrame";
import { PublishSlot, ReadinessSlot } from "./PublishSlot";
import { ReadinessPanel } from "./ReadinessPanel";
import { StatusBadge } from "./StatusBadge";
import type { LandingVariant } from "@/lib/data/landing-variants";
import { buildVariantGrid, type VariantGridRow } from "@/lib/landing/variant-grid";
import { findOrphans, resolveVariant } from "@/lib/landing/resolve-variant";
import { VariantSwitcher } from "./variants/VariantSwitcher";
import { LinksPanel } from "./variants/LinksPanel";
import { LinkPublishSlot, MAIN_FIRST } from "./variants/LinkPublishSlot";
import { linkMissingFromLive } from "@/lib/landing/link-names";
import type { VariantRef } from "@/lib/landing/variants";
import {
  linkSections, moveOnLink, removeOrphans, resetOverrideField, sameOverrides, setOverrideField, setOverrideHidden, switcherOptions,
  useLinkEditing,
} from "./variants/useLinkEditing";

const LIST_HREF = "/dashboard/admin/landing-pages";
const SETTINGS = "__settings__";
const LINKS = "__links__";
const KIND_LABEL: Record<PageKind, string> = { course: "Course", workshop: "Workshop", webinar: "Webinar" };

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  dirty: "Unsaved changes",
  error: "Couldn't save, retrying when you keep typing",
  conflict: "Changes not saved",
};
// The header shows the worse of the main page's and the open link's save state.
const SAVE_RANK: Record<SaveState, number> = { saved: 0, dirty: 1, saving: 2, error: 3, conflict: 4 };
const worse = (a: SaveState, b: SaveState) => (SAVE_RANK[b] > SAVE_RANK[a] ? b : a);
const SAVE_DOT: Record<SaveState, string> = {
  saved: "bg-pz-success",
  saving: "bg-pz-warning animate-pulse",
  dirty: "bg-pz-warning",
  error: "bg-pz-solid-danger",
  conflict: "bg-pz-solid-danger",
};

/**
 * The editor remounts onto the server's draft only after this editor's own restore succeeded (the
 * refreshed page then carries a newer revision). Any other refresh keeps the editor as it is,
 * including one that lands while an autosave is still in flight. Remounting there dropped the typing,
 * and the old autosave kept writing a revision the new editor did not know, so its next save hit a
 * false conflict. Someone else's change surfaces as a save conflict, and its Reload button does a
 * full browser reload.
 */
export function LandingEditor({
  page, versions, accounts = [], sheetId = null, variants = [],
}: {
  page: LandingPage; versions: LandingVersion[]; accounts?: PaymentAccountSummary[]; sheetId?: string | null;
  /** The page's country / module links. */
  variants?: LandingVariant[];
}) {
  const known = useRef(page.revision);
  const remountAbove = useRef<number | null>(null);
  const [epoch, setEpoch] = useState(0);
  const lastId = useRef(page.id);
  useEffect(() => {
    if (lastId.current !== page.id) {
      lastId.current = page.id; known.current = page.revision; remountAbove.current = null; setEpoch((e) => e + 1);
      return;
    }
    if (remountAbove.current !== null && page.revision > remountAbove.current) {
      remountAbove.current = null; known.current = page.revision; setEpoch((e) => e + 1);
    }
  }, [page.id, page.revision]);
  const onRevision = useCallback((rev: number) => { if (rev > known.current) known.current = rev; }, []);
  // A restore bumps the revision past everything this editor saved; remount once that refresh arrives.
  const onRestored = useCallback(() => { remountAbove.current = known.current; }, []);
  return (
    <>
      <PhoneNotice />
      <EditorShell key={`${page.id}:${epoch}`} page={page} versions={versions} accounts={accounts} sheetId={sheetId} variants={variants} onRevision={onRevision} onRestored={onRestored} />
    </>
  );
}

function PhoneNotice() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center md:hidden">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pz-surface-container-high text-pz-on-surface-variant">
        <Monitor className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="font-headline text-xl font-bold text-pz-on-surface">The page editor works best on a laptop or tablet</h1>
      <p className="max-w-sm font-body text-sm text-pz-on-surface-variant">
        Open this editor on a laptop or tablet. Building a page needs room for the form and a live preview side by side.
      </p>
      <Button asChild className="min-h-11">
        <Link href={LIST_HREF}>
          <ArrowLeft aria-hidden="true" />
          Back to Landing Pages
        </Link>
      </Button>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function EditorShell({
  page, versions, accounts, sheetId, variants, onRevision, onRestored,
}: {
  page: LandingPage; versions: LandingVersion[]; accounts: PaymentAccountSummary[]; sheetId: string | null;
  variants: LandingVariant[]; onRevision: (rev: number) => void; onRestored: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const confirmDiscard = useCallback(() => confirm({
    title: "Switch without saving?",
    description: "Your latest changes to this link were not saved. Switch anyway?",
    confirmLabel: "Switch anyway",
    destructive: true,
  }), [confirm]);
  // Called before the main page's autosave so both hooks keep a fixed call order.
  const link = useLinkEditing({ pageId: page.id, variants, confirmDiscard });
  const { state: mainState, schedule, saveNow: saveMain } = useAutosaveDraft({ pageId: page.id, initialRevision: page.revision, onRevision });
  const state = worse(mainState, link.saveState);
  const saveLink = link.saveNow;
  const onLink = link.activeId !== null;
  // Captured into every link edit handler below; see useLinkEditing's update.
  const linkId = link.activeId;
  // Switching links flushes the link being left, so only the open link can have pending edits.
  const saveNow = useCallback(async () => {
    if (!onLink) return saveMain();
    const [a, b] = await Promise.all([saveMain(), saveLink()]);
    return a && b;
  }, [onLink, saveMain, saveLink]);
  const [content, setContent] = useState<LandingContent>(page.draft);
  const [selection, setSelection] = useState<string>(page.draft.sections[0]?.id ?? SETTINGS);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [drawer, setDrawer] = useState(false);
  const [regStep, setRegStep] = useState<RegistrationStepKey>("buy");

  // Always derive edits from the freshest content, never from a render-time capture: an image upload
  // can finish seconds later and must not revert what was typed meanwhile.
  const contentRef = useRef(content);
  const [serverProblems, setServerProblems] = useState<Problem[] | null>(null);
  const apply = useCallback((next: LandingContent) => {
    contentRef.current = next;
    setContent(next);
    setServerProblems(null); // the server's list described the old content; the local check takes over again
    schedule(next);
  }, [schedule]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  // Best effort for the browser Back button and other in-app exits: flush a pending edit on unmount.
  useEffect(() => () => { if (stateRef.current === "dirty") void saveNowRef.current(); }, []);

  const [title, setTitle] = useState(page.title);
  const [nameDraft, setNameDraft] = useState(page.title);
  const renaming = useRef(false);
  const cancelNextCommit = useRef(false);
  async function commitName() {
    // Escape blurs the field inside the same event, before state re-renders, so this closure still
    // holds the typed draft; the flag makes that blur a cancel instead of a commit.
    if (cancelNextCommit.current) { cancelNextCommit.current = false; setNameDraft(title); return; }
    if (renaming.current) return;
    const next = nameDraft.trim();
    if (next === "" || next === title) { setNameDraft(title); return; }
    renaming.current = true;
    try {
      const res = await fetch(`/api/admin/landing-pages/${page.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Couldn't rename the page.");
        setNameDraft(title);
        return;
      }
      setTitle(next);
      setServerProblems(null);
      setNameDraft(next);
      // revalidatePath in the route handler does not clear the browser's router cache, so Back to
      // Landing Pages (or reopening this page) could show the old name for a while. router.refresh()
      // drops that cache. It does not remount the editor: the revision did not change.
      router.refresh();
      toast.success("Page renamed.");
    } catch {
      toast.error("Couldn't rename the page.");
      setNameDraft(title);
    } finally {
      renaming.current = false;
    }
  }

  async function leaveToList(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const st = stateRef.current;
    if (st === "saved") return;
    e.preventDefault();
    let ok = st !== "error" && st !== "conflict";
    if (ok) ok = await saveNow();
    if (!ok) {
      ok = await confirm({
        title: "Leave without saving?",
        description: "Your latest changes were not saved. Leave anyway?",
        confirmLabel: "Leave anyway",
        destructive: true,
      });
    }
    if (ok) router.push(LIST_HREF);
  }

  // Warn before leaving while anything could be lost: unsaved, in flight, failed, or conflicted
  // (after a conflict, further edits are not saved at all). `leaving` turns the guard off for an exit
  // the admin already confirmed in our own dialog, so the browser does not ask a second time.
  const unsafeToLeave = state === "dirty" || state === "saving" || state === "error" || state === "conflict";
  const leaving = useRef(false);
  useEffect(() => {
    if (!unsafeToLeave) return;
    const guard = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsafeToLeave]);

  async function reload() {
    const ok = await confirm({
      title: "Reload this page?",
      description: "Someone else's version will replace what you see. Reloading discards the changes you just made. Reload anyway?",
      confirmLabel: "Reload",
      destructive: true,
    });
    if (!ok) return;
    leaving.current = true;
    window.location.reload();
  }

  // Tablet (below lg): the Sections drawer is a modal. Focus moves into it, Tab stays inside, and
  // Escape (or a tap on the scrim) closes it and returns focus to its toggle.
  const drawerRef = useRef<HTMLElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const items = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        drawerToggleRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  // On a country / module link the form shows main's values with that link's own edits on top.
  const overrides = link.overrides;
  const shownSections = useMemo(
    () => (overrides ? linkSections(content, overrides) : content.sections),
    [content, overrides],
  );
  const previewContent = useMemo(
    () => (link.active && overrides ? resolveVariant(content, link.active.ref, overrides) : content),
    [content, link.active, overrides],
  );
  const orphans = useMemo(() => (overrides ? findOrphans(content, overrides) : null), [content, overrides]);
  const orphanCount = orphans ? orphans.sectionIds.length + orphans.fields.length : 0;
  const mainHidden = useMemo(() => new Set(content.sections.filter((s) => !s.enabled).map((s) => s.id)), [content]);

  // Every link the page could have, from the main page as it is being edited, joined with the links
  // that exist. A country or module added here shows up at once.
  const grid = useMemo(() => buildVariantGrid(content, link.variants), [content, link.variants]);
  const options = useMemo(() => switcherOptions(grid), [grid]);
  const linkLabel = options.find((o) => o.id === link.activeId)?.label ?? "";
  const mainLive = !!page.published && page.status !== "draft";
  const linkLive = !!link.active?.published;
  const linkChanged = !!link.active && !sameOverrides(overrides, link.active.published);
  const blockedBy = useCallback(
    (ref: VariantRef) => linkMissingFromLive(ref, content, mainLive ? page.published : null),
    [content, mainLive, page.published],
  );
  const linkBlockedBy = link.active ? blockedBy(link.active.ref) : null;
  // The open link's checklist: the server's list after a refused publish, else the same check the
  // server runs on main's live content with this link's edits applied.
  const linkProblems = useMemo<Problem[] | null>(() => {
    if (!link.active || !overrides) return null;
    const server = link.problems[link.active.id];
    if (server) return server;
    if (!page.published || linkBlockedBy) return [{ message: `${linkBlockedBy ?? MAIN_FIRST}. This link can go live after that.` }];
    return computeReadiness(resolveVariant(page.published, link.active.ref, overrides), { title, slug: page.slug }).problems;
  }, [link.active, link.problems, overrides, page.published, page.slug, linkBlockedBy, title]);

  const selected = shownSections.find((s) => s.id === selection) ?? null;
  const showSettings = selection === SETTINGS;
  const showLinks = selection === LINKS;
  const current = showSettings || showLinks ? null : selected ?? shownSections[0] ?? null;
  const ownFields = useMemo(() => {
    const ov = current && overrides ? overrides.sections[current.id] : undefined;
    return new Set(Object.keys(ov?.fields ?? {}));
  }, [current, overrides]);
  const hiddenOnLink = !!(current && overrides?.sections[current.id]?.hidden);
  const select = (id: string) => {
    const step = parseRegistrationTarget(id);
    if (step) {
      setRegStep(step);
      setSelection(SETTINGS);
      setPane("edit");
      setDrawer(false);
      // Bring the stepper into view after React renders the settings pane.
      requestAnimationFrame(() => {
        const el = document.getElementById("registration-setup");
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
      });
      return;
    }
    setSelection(id); setPane("edit"); setDrawer(false);
  };

  // Fix in the checklist: jump to the section, then put the cursor in the field (after it rendered).
  const mainRef = useRef<HTMLElement>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  useEffect(() => {
    if (!focusPath) return;
    const el = Array.from(mainRef.current?.querySelectorAll<HTMLElement>("[data-field-path]") ?? []).find((n) => n.dataset.fieldPath === focusPath);
    const target = el && (el.matches("input, textarea, button, select") ? el : el.querySelector<HTMLElement>("input, textarea, button, select"));
    target?.focus();
    setFocusPath(null);
  }, [focusPath, selection]);
  const gotoProblem = (id: string, field?: string) => { select(id); if (field) setFocusPath(field); };

  function onAdd(type: Parameters<typeof addSection>[1]) {
    const before = contentRef.current;
    const next = addSection(before, type);
    apply(next);
    const known = new Set(before.sections.map((s) => s.id));
    const created = next.sections.find((s) => !known.has(s.id));
    if (created) select(created.id);
  }
  function onRemove(id: string) {
    const next = removeSection(contentRef.current, id);
    apply(next);
    if (selection === id) setSelection(next.sections[0]?.id ?? SETTINGS);
  }

  /** Add a country: a main-page edit (regions + prices), saved by the main page's autosave. */
  function onAddCountry(region: RegionDef, cells: Record<string, PriceCell>) {
    const r = contentRef.current.registration;
    const prices = { ...r.prices };
    for (const [option, cell] of Object.entries(cells)) prices[option] = { ...(prices[option] ?? {}), [region.key]: cell };
    apply(updateRegistration(contentRef.current, {
      regions: [...r.regions, region], defaultRegionKey: r.defaultRegionKey || region.key, prices,
    }));
    toast.success(`${region.label} added`);
  }
  const switchLink = (row: VariantGridRow, on: boolean) => link.setLinkOn(row.ref, row.variantId, on, saveMain);
  // Modules are only for courses and workshops; a module that already has a link keeps its link name.
  const modulesProps = page.kind === "webinar" ? undefined : {
    modules: content.modules,
    registration: content.registration,
    slug: page.slug,
    lockedKeys: link.variants.map((v) => v.ref.moduleKey).filter((k): k is string => !!k),
    onModules: (modules: LandingContent["modules"]) => apply(updateModules(contentRef.current, modules)),
    onRename: (from: string, to: string) => apply(renameModule(contentRef.current, from, to)),
  };

  const slotProps = {
    page, title, versions, content, saveState: state, saveNow,
    onSelectSection: gotoProblem, serverProblems, onServerProblems: setServerProblems, onRestored,
    onKeepReview: (paths: string[]) => apply(clearReview(contentRef.current, paths)),
  };

  return (
    <div className="fixed inset-0 z-50 hidden flex-col bg-pz-surface md:flex">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-pz-outline-variant bg-pz-surface-container-lowest px-4 py-2">
        <Link
          href={LIST_HREF}
          onClick={(e) => void leaveToList(e)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-2.5 py-1.5 font-body text-xs font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Landing Pages
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <input
            aria-label="Page name"
            value={nameDraft}
            maxLength={120}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitName();
              if (e.key === "Escape") { cancelNextCommit.current = true; setNameDraft(title); e.currentTarget.blur(); cancelNextCommit.current = false; }
            }}
            className="w-56 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-headline text-sm font-bold text-pz-on-surface hover:border-pz-outline-variant focus-visible:border-pz-outline-variant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="shrink-0 rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-[11px] font-medium text-pz-on-surface-variant">{KIND_LABEL[page.kind]}</span>
          <StatusBadge status={page.status} className="shrink-0" />
        </div>
        {options.length > 0 && (
          <VariantSwitcher options={options} value={link.activeId} onChange={(id) => void link.switchTo(id)} />
        )}
        <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
          <span className={cn("h-2 w-2 rounded-full", SAVE_DOT[state])} aria-hidden="true" />
          {SAVE_TEXT[state]}
          {state === "error" && (
            <button type="button" onClick={() => void saveNow()} className="font-semibold text-pz-primary underline-offset-2 hover:underline">
              Try again
            </button>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-pz-surface-container-high p-0.5 lg:hidden" role="group" aria-label="Editor view">
            {(["edit", "preview"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={pane === p}
                onClick={() => setPane(p)}
                className={cn(
                  "rounded-md px-3 py-1 font-body text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  pane === p ? "bg-pz-surface-container-lowest font-bold text-pz-on-surface shadow-sm" : "font-medium text-pz-on-surface-variant",
                )}
              >
                {p === "edit" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>
          <a
            href={`${LIST_HREF}/${page.id}/preview${link.path ? `?v=${encodeURIComponent(link.path)}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Preview in new tab"
            className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Preview
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          {link.active && linkProblems ? (
            <LinkPublishSlot
              key={link.active.id}
              label={linkLabel}
              blockedBy={linkBlockedBy}
              live={linkLive}
              changed={linkChanged}
              problems={linkProblems}
              saveState={link.saveState}
              onPublish={() => link.publish(link.active!.id)}
              loadVersions={() => link.loadVersions(link.active!.id)}
              onRestore={(v) => link.restore(link.active!.id, v)}
            />
          ) : (
            <PublishSlot {...slotProps} />
          )}
        </div>
      </header>

      {state === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-pz-solid-danger/30 bg-pz-error-container px-4 py-2 text-pz-on-error-container">
          <p className="font-body text-sm font-semibold">
            {mainState === "conflict" ? "Someone else changed this page. Reload to see their changes." : "Someone else changed this link. Reload to see their changes."}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()} className="bg-pz-surface-container-lowest text-pz-on-surface">
            Reload
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-pz-outline-variant bg-pz-surface-container-low px-4 py-1.5 lg:hidden">
        <button
          ref={drawerToggleRef}
          type="button"
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-2.5 py-1 font-body text-xs font-semibold text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
          Sections ({shownSections.length})
        </button>
        <span className="truncate font-body text-xs text-pz-on-surface-variant">
          Section: {showSettings ? "Page settings" : showLinks ? "Links" : current ? SECTION_DEFS[current.type].label : "nothing yet"}
        </span>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1.1fr)]">
        {drawer && (
          // Tablet only: dims the form behind the open Sections drawer; a tap closes it.
          <div aria-hidden="true" data-sections-scrim="" onClick={() => setDrawer(false)} className="absolute inset-0 z-[5] bg-black/40 lg:hidden" />
        )}
        <aside
          ref={drawerRef}
          {...(drawer ? { role: "dialog", "aria-modal": true, "aria-label": "Page sections" } : {})}
          className={cn(
            "min-h-0 space-y-3 overflow-y-auto border-pz-outline-variant bg-pz-surface-container-lowest p-3 lg:block lg:border-r",
            drawer ? "absolute inset-y-0 left-0 z-10 block w-72 border-r shadow-lg" : "hidden",
          )}
        >
          <button
            type="button"
            onClick={() => select(SETTINGS)}
            aria-current={showSettings ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11",
              showSettings ? "border-pz-solid-forest bg-pz-primary-container/40" : "border-pz-outline-variant hover:bg-pz-surface-container-high",
            )}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-body text-sm font-semibold text-pz-on-surface">Page settings</span>
              <span className="block font-body text-[11px] text-pz-on-surface-variant">Registration, countdown, sharing</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => select(LINKS)}
            aria-current={showLinks ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11",
              showLinks ? "border-pz-solid-forest bg-pz-primary-container/40" : "border-pz-outline-variant hover:bg-pz-surface-container-high",
            )}
          >
            <Link2 className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-body text-sm font-semibold text-pz-on-surface">Links</span>
              <span className="block font-body text-[11px] text-pz-on-surface-variant">A web address for each country or module</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
          </button>
          <SectionList
            sections={shownSections}
            selectedId={current?.id ?? null}
            onSelect={select}
            onToggle={(id) => (onLink
              ? link.update((ov) => setOverrideHidden(ov, id, !ov.sections[id]?.hidden), linkId)
              : apply(toggleSection(contentRef.current, id)))}
            onMove={(id, dir) => (onLink
              ? link.update((ov) => moveOnLink(contentRef.current, ov, id, dir), linkId)
              : apply(moveSection(contentRef.current, id, dir)))}
            onRemove={onRemove}
            onAdd={onAdd}
            link={onLink ? { mainHidden } : undefined}
          />
          {linkProblems ? (
            <ReadinessPanel problems={linkProblems} onGoto={(id, field) => gotoProblem(id, field)} />
          ) : (
            <ReadinessSlot {...slotProps} />
          )}
        </aside>

        <main ref={mainRef} className={cn("min-h-0 overflow-y-auto bg-pz-surface p-4 lg:block lg:p-5", pane === "edit" ? "block" : "hidden")}>
          {onLink && orphanCount > 0 && (
            <details className="mb-4 rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-3 py-2">
              <summary className="cursor-pointer font-body text-sm font-semibold text-pz-on-surface">
                {orphanCount === 1 ? "1 edit no longer applies" : `${orphanCount} edits no longer apply`}
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="flex-1 font-body text-xs text-pz-on-surface-variant">
                  These edits were made for parts of the main page that have since been removed, so this link no longer shows them.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => link.update((ov) => removeOrphans(contentRef.current, ov), linkId)}>
                  Remove
                </Button>
              </div>
            </details>
          )}
          {showLinks ? (
            <LinksPanel
              slug={page.slug}
              grid={grid}
              content={content}
              accounts={accounts}
              mainLive={mainLive}
              blockedBy={(row) => blockedBy(row.ref)}
              problems={link.problems}
              onSwitch={switchLink}
              onPublish={link.publish}
              onAddCountry={onAddCountry}
            />
          ) : showSettings && onLink ? (
            <div className="space-y-4">
              <p role="note" className="rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-3 py-2 font-body text-sm text-pz-on-surface">
                These apply to all links. Edit them on the main page.
              </p>
              <fieldset disabled className="min-w-0 space-y-5 opacity-80">
                <PageSettingsPanel
                  settings={content.settings}
                  seo={content.seo}
                  slug={page.slug}
                  pageTitle={title}
                  onSettings={() => {}}
                  onSeo={() => {}}
                  registration={content.registration}
                  accounts={accounts}
                  registrationStep={regStep}
                  onRegistrationStep={setRegStep}
                  onRegistration={() => {}}
                  modules={modulesProps && { ...modulesProps, onModules: () => {}, onRename: () => {} }}
                />
              </fieldset>
            </div>
          ) : showSettings ? (
            <PageSettingsPanel
              settings={content.settings}
              seo={content.seo}
              slug={page.slug}
              pageTitle={title}
              onSettings={(patch) => apply(updateSettings(contentRef.current, patch))}
              onSeo={(patch) => apply(updateSeo(contentRef.current, patch))}
              registration={content.registration}
              accounts={accounts}
              registrationStep={regStep}
              onRegistrationStep={setRegStep}
              onRegistration={(next) => apply(updateRegistration(contentRef.current, next))}
              modules={modulesProps}
            >
              {content.registration.enabled ? (
                <RegistrationOpsCard pageId={page.id} slug={page.slug} status={page.status} initialSheetId={sheetId} />
              ) : null}
            </PageSettingsPanel>
          ) : current ? (
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-headline text-lg font-bold text-pz-on-surface">{SECTION_DEFS[current.type].label}</h2>
                  <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-[11px] font-semibold text-pz-on-surface-variant">
                    {current.enabled ? (onLink ? "Shown on this link" : "Shown on the page") : "Hidden"}
                  </span>
                </div>
                <p className="font-body text-sm text-pz-on-surface-variant">{SECTION_DEFS[current.type].description}</p>
                {onLink ? (
                  mainHidden.has(current.id) ? (
                    <p className="font-body text-xs text-pz-on-surface-variant">This section is hidden on the main page, so it is hidden on every link.</p>
                  ) : (
                    <label className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface">
                      <input
                        type="checkbox"
                        checked={hiddenOnLink}
                        onChange={(e) => {
                          const hide = e.target.checked;
                          link.update((ov) => setOverrideHidden(ov, current.id, hide), linkId);
                        }}
                        className="h-4 w-4 accent-pz-solid-forest"
                      />
                      Hide on this link
                    </label>
                  )
                ) : !current.enabled && (
                  <p className="font-body text-xs text-pz-on-surface-variant">This section is hidden. Turn on its switch in the list to show it on the page.</p>
                )}
              </div>
              <SectionForm
                key={`${link.activeId ?? "main"}:${current.id}`}
                type={current.type}
                data={current.data}
                modules={content.modules}
                sections={content.sections
                  .filter((x) => x.enabled && x.id !== current.id)
                  .map((x) => ({ id: x.id, label: SECTION_DEFS[x.type].navLabel ?? SECTION_DEFS[x.type].label }))}
                onChange={(data) => apply(updateSectionData(contentRef.current, current.id, data))}
                link={onLink ? {
                  overridden: ownFields,
                  onFieldChange: (key, value) => link.update((ov) => setOverrideField(ov, current.id, key, value), linkId),
                  onReset: (key) => link.update((ov) => resetOverrideField(ov, current.id, key), linkId),
                } : undefined}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <LayoutList className="h-8 w-8 text-pz-on-surface-variant" aria-hidden="true" />
              <p className="font-body text-sm text-pz-on-surface-variant">This page has no sections yet. Use Add section on the left to start.</p>
            </div>
          )}
        </main>

        <section aria-label="Live preview" className={cn("min-h-0 border-pz-outline-variant bg-pz-surface-container-low p-3 lg:block lg:border-l", pane === "preview" ? "block" : "hidden")}>
          <PreviewFrame content={previewContent} pageId={page.id} title={title} variant={link.path} />
        </section>
      </div>
    </div>
  );
}
