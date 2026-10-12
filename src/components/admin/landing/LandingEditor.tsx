"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink, LayoutList, Monitor, PanelLeft, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAutosaveDraft, type SaveState } from "@/hooks/useAutosaveDraft";
import type { LandingPage, LandingVersion } from "@/lib/data/landing-pages";
import {
  addSection, moveSection, removeSection, toggleSection, updateSectionData, updateSeo, updateSettings,
  type LandingContent, type PageKind,
} from "@/lib/landing/content";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { SectionList } from "./SectionList";
import { SectionForm } from "./SectionForm";
import { PageSettingsPanel } from "./PageSettingsPanel";
import { PreviewFrame } from "./PreviewFrame";
import { PublishSlot, ReadinessSlot } from "./PublishSlot";
import { StatusBadge } from "./StatusBadge";

const LIST_HREF = "/dashboard/admin/landing-pages";
const SETTINGS = "__settings__";
const KIND_LABEL: Record<PageKind, string> = { course: "Course", workshop: "Workshop", webinar: "Webinar" };

const SAVE_TEXT: Record<SaveState, string> = {
  saved: "Saved",
  saving: "Saving…",
  dirty: "Unsaved changes",
  error: "Couldn't save, retrying when you keep typing",
  conflict: "Changes not saved",
};
const SAVE_DOT: Record<SaveState, string> = {
  saved: "bg-pz-success",
  saving: "bg-pz-warning animate-pulse",
  dirty: "bg-pz-warning",
  error: "bg-pz-solid-danger",
  conflict: "bg-pz-solid-danger",
};

/**
 * The editor remounts whenever the server hands it a newer revision (after a confirmed Reload), so a
 * reload really does drop the local edits and restart autosave from the fresh revision.
 */
export function LandingEditor({ page, versions }: { page: LandingPage; versions: LandingVersion[] }) {
  return (
    <>
      <PhoneNotice />
      <EditorShell key={`${page.id}:${page.revision}`} page={page} versions={versions} />
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

function EditorShell({ page, versions }: { page: LandingPage; versions: LandingVersion[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { state, schedule, saveNow } = useAutosaveDraft({ pageId: page.id, initialRevision: page.revision });
  const [content, setContent] = useState<LandingContent>(page.draft);
  const [selection, setSelection] = useState<string>(page.draft.sections[0]?.id ?? SETTINGS);
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [drawer, setDrawer] = useState(false);

  const apply = useCallback((next: LandingContent) => { setContent(next); schedule(next); }, [schedule]);

  // Warn before leaving while anything could be lost: unsaved, in flight, failed, or conflicted
  // (after a conflict, further edits are not saved at all).
  const unsafeToLeave = state === "dirty" || state === "saving" || state === "error" || state === "conflict";
  useEffect(() => {
    if (!unsafeToLeave) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
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
    if (ok) router.refresh();
  }

  const selected = content.sections.find((s) => s.id === selection) ?? null;
  const showSettings = selection === SETTINGS;
  const current = showSettings ? null : selected ?? content.sections[0] ?? null;
  const select = (id: string) => { setSelection(id); setPane("edit"); setDrawer(false); };

  function onAdd(type: Parameters<typeof addSection>[1]) {
    const next = addSection(content, type);
    apply(next);
    const known = new Set(content.sections.map((s) => s.id));
    const created = next.sections.find((s) => !known.has(s.id));
    if (created) select(created.id);
  }
  function onRemove(id: string) {
    const next = removeSection(content, id);
    apply(next);
    if (selection === id) setSelection(next.sections[0]?.id ?? SETTINGS);
  }

  const slotProps = { page, versions, content, saveState: state, saveNow };

  return (
    <div className="fixed inset-0 z-50 hidden flex-col bg-pz-surface md:flex">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-pz-outline-variant bg-pz-surface-container-lowest px-4 py-2">
        <Link
          href={LIST_HREF}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-2.5 py-1.5 font-body text-xs font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Landing Pages
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate font-headline text-sm font-bold text-pz-on-surface">{page.title}</h1>
          <span className="shrink-0 rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-[11px] font-medium text-pz-on-surface-variant">{KIND_LABEL[page.kind]}</span>
          <StatusBadge status={page.status} className="shrink-0" />
        </div>
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
            href={`${LIST_HREF}/${page.id}/preview`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Preview in new tab"
            className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Preview
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <PublishSlot {...slotProps} />
        </div>
      </header>

      {state === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-pz-solid-danger/30 bg-pz-error-container px-4 py-2 text-pz-on-error-container">
          <p className="font-body text-sm font-semibold">Someone else changed this page. Reload to see their changes.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()} className="bg-pz-surface-container-lowest text-pz-on-surface">
            Reload
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-pz-outline-variant bg-pz-surface-container-low px-4 py-1.5 lg:hidden">
        <button
          type="button"
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-2.5 py-1 font-body text-xs font-semibold text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
          Sections ({content.sections.length})
        </button>
        <span className="truncate font-body text-xs text-pz-on-surface-variant">
          Editing: {showSettings ? "Page settings" : current ? SECTION_DEFS[current.type].label : "nothing yet"}
        </span>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1.1fr)]">
        <aside
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
              <span className="block font-body text-[11px] text-pz-on-surface-variant">Register link, countdown, sharing</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
          </button>
          <SectionList
            sections={content.sections}
            selectedId={showSettings ? null : current?.id ?? null}
            onSelect={select}
            onToggle={(id) => apply(toggleSection(content, id))}
            onMove={(id, dir) => apply(moveSection(content, id, dir))}
            onRemove={onRemove}
            onAdd={onAdd}
          />
          <ReadinessSlot {...slotProps} />
        </aside>

        <main className={cn("min-h-0 overflow-y-auto bg-pz-surface p-4 lg:block lg:p-5", pane === "edit" ? "block" : "hidden")}>
          {showSettings ? (
            <PageSettingsPanel
              settings={content.settings}
              seo={content.seo}
              slug={page.slug}
              pageTitle={page.title}
              onSettings={(patch) => apply(updateSettings(content, patch))}
              onSeo={(patch) => apply(updateSeo(content, patch))}
            />
          ) : current ? (
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-headline text-lg font-bold text-pz-on-surface">{SECTION_DEFS[current.type].label}</h2>
                  <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-body text-[11px] font-semibold text-pz-on-surface-variant">
                    {current.enabled ? "Shown on the page" : "Hidden"}
                  </span>
                </div>
                <p className="font-body text-sm text-pz-on-surface-variant">{SECTION_DEFS[current.type].description}</p>
                {!current.enabled && (
                  <p className="font-body text-xs text-pz-on-surface-variant">This section is hidden. Turn on its switch in the list to show it on the page.</p>
                )}
              </div>
              <SectionForm
                key={current.id}
                type={current.type}
                data={current.data}
                onChange={(data) => apply(updateSectionData(content, current.id, data))}
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
          <PreviewFrame content={content} pageId={page.id} />
        </section>
      </div>
    </div>
  );
}
