"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { LandingPage, LandingVersion } from "@/lib/data/landing-pages";
import { computeReadiness, hasUnpublishedChanges, normalizeContent, type LandingContent, type Problem } from "@/lib/landing/content";
import type { SaveState } from "@/hooks/useAutosaveDraft";
import { ReadinessPanel } from "./ReadinessPanel";
import { VersionsPanel } from "./VersionsPanel";

export interface EditorSlotProps {
  page: LandingPage;
  /** The current saved page name (may be newer than page.title after a rename). Readiness should use this. */
  title: string;
  versions: LandingVersion[];
  content: LandingContent;
  saveState: SaveState;
  saveNow: () => Promise<boolean>;
  /** Selects a section in the editor and focuses `field` in it (the checklist's Fix buttons). */
  onSelectSection?: (id: string, field?: string) => void;
  /** Called after a restore succeeded: the editor remounts onto the restored draft when the refresh arrives. */
  onRestored?: () => void;
  /** The server's readiness list after a refused publish. It wins over the local check until the next edit. */
  serverProblems?: Problem[] | null;
  onServerProblems?: (problems: Problem[] | null) => void;
}

const STATUS_TEXT = { draft: "Not published yet", published: "Live", closed: "Closed" } as const;

/** The top bar's Versions and Publish controls, plus the live status next to them. */
export function PublishSlot(props: EditorSlotProps): React.ReactNode {
  const { page, title, versions, content, saveState, saveNow, onServerProblems, onRestored } = props;
  const router = useRouter();
  const [sheet, setSheet] = useState(false);

  const local = computeReadiness(content, { title, slug: page.slug });
  const changed = page.published ? hasUnpublishedChanges(normalizeContent(content), normalizeContent(page.published)) : true;
  const closed = page.status === "closed";
  const upToDate = (page.status === "published" || closed) && !changed;
  const conflict = saveState === "conflict";
  const serverBlocked = (props.serverProblems?.length ?? 0) > 0;

  const publish = useAsyncAction(async () => {
    // Flush every edit first: the refresh below is only safe when nothing is left unsaved.
    const saved = await saveNow();
    if (!saved) {
      toast.error("Your latest changes could not be saved. Try again.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/landing-pages/${page.id}/publish`, { method: "POST" });
      if (res.ok) {
        onServerProblems?.(null);
        toast.success(closed ? "Changes published. Registration stays closed." : "Page published");
        router.refresh();
        return;
      }
      const payload = (await res.json().catch(() => null)) as { error?: string; problems?: Problem[] } | null;
      if (res.status === 422 && Array.isArray(payload?.problems)) {
        onServerProblems?.(payload.problems);
        toast.error("Not ready to publish yet");
        return;
      }
      toast.error(payload?.error ?? "Could not publish the page. Please try again.");
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  const restore = useAsyncAction(async (version: number) => {
    // The restore replaces the server draft, so pending local edits are dropped on purpose, never saved.
    try {
      const res = await fetch(`/api/admin/landing-pages/${page.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (res.ok) {
        toast.success(`Restored version ${version}`);
        setSheet(false);
        onRestored?.();
        router.refresh();
        return;
      }
      const payload = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (res.status === 409 || payload?.code === "conflict") {
        toast.error("Someone else changed this page. Reload and try again.");
        return;
      }
      toast.error(payload?.error ?? "Could not restore that version. Please try again.");
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const blocked = local.problems.length > 0 || serverBlocked || saveState === "saving" || conflict || upToDate;

  return (
    <>
      <span className="inline-flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
        <span>{STATUS_TEXT[page.status]}</span>
        {closed && <span>Registration is closed. Reopen it from the Landing Pages list.</span>}
        {conflict && <span>Someone else changed this page. Reload to see their changes first.</span>}
        {page.published && changed && (
          <span className="rounded-full bg-pz-secondary-container px-2 py-0.5 font-headline text-[11px] font-semibold text-pz-on-secondary-container">Unpublished changes</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-1.5 font-body text-xs font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <History className="h-4 w-4 text-pz-on-surface-variant" aria-hidden="true" />
        Versions
      </button>
      <Button
        type="button"
        size="sm"
        loading={publish.pending}
        disabled={blocked}
        onClick={() => void publish.run()}
        title={local.problems.length > 0 ? `${local.problems.length} checklist item${local.problems.length === 1 ? "" : "s"} to fix before publishing` : undefined}
        className="bg-pz-solid-forest text-white hover:bg-pz-solid-forest/90 disabled:opacity-100 disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant"
      >
        <Rocket aria-hidden="true" />
        {upToDate ? "Published" : "Publish"}
      </Button>

      {sheet && (
        <aside
          role="dialog"
          aria-label="Version history"
          className="fixed inset-y-0 right-0 z-[60] flex w-[min(380px,100vw)] flex-col border-l border-pz-outline-variant bg-pz-surface-container-lowest shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-pz-outline-variant p-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-pz-primary" aria-hidden="true" />
              <div>
                <h2 className="font-headline text-sm font-bold text-pz-on-surface">Version History</h2>
                <p className="font-body text-[11px] text-pz-on-surface-variant">A snapshot is saved each time you publish</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close version history"
              onClick={() => setSheet(false)}
              className="rounded-lg p-1 text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <VersionsPanel versions={versions} onRestore={(v) => void restore.run(v)} busy={restore.pending} />
          </div>
          <div className="border-t border-pz-outline-variant bg-pz-surface-container-low p-3">
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setSheet(false)}>Done</Button>
          </div>
        </aside>
      )}
    </>
  );
}

/** The "Ready to publish?" checklist under the section list. */
export function ReadinessSlot({ page, title, content, serverProblems, onSelectSection }: EditorSlotProps): React.ReactNode {
  const problems = serverProblems ?? computeReadiness(content, { title, slug: page.slug }).problems;
  return <ReadinessPanel problems={problems} onGoto={(id, field) => onSelectSection?.(id, field)} />;
}
