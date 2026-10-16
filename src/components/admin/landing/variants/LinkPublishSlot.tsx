"use client";

import { useState } from "react";
import { toast } from "sonner";
import { History, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { SaveState } from "@/hooks/useAutosaveDraft";
import type { Problem } from "@/lib/landing/content";
import type { LandingVariantVersion } from "@/lib/data/landing-variants";
import { VersionsPanel } from "../VersionsPanel";
import { VersionsSheet } from "../PublishSlot";
import type { PublishOutcome } from "./useLinkEditing";

export const MAIN_FIRST = "Publish the main page first";

/**
 * The top bar's status, Versions and Publish while a country / module link is open: they act on that
 * link, never on the main page.
 */
export function LinkPublishSlot({
  label, mainLive, live, changed, problems, saveState, onPublish, loadVersions, onRestore,
}: {
  label: string;
  /** The main page is live; a link can only go live after it. */
  mainLive: boolean;
  /** This link has been published at least once. */
  live: boolean;
  /** Its draft differs from what is live. */
  changed: boolean;
  /** What stops it being published (the local check, or the server's list after a refusal). */
  problems: Problem[];
  saveState: SaveState;
  onPublish: () => Promise<PublishOutcome>;
  loadVersions: () => Promise<LandingVariantVersion[] | null>;
  onRestore: (version: number) => Promise<string | null>;
}): React.ReactNode {
  const [versions, setVersions] = useState<LandingVariantVersion[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const upToDate = live && !changed;
  const conflict = saveState === "conflict";

  const publish = useAsyncAction(async () => {
    const r = await onPublish();
    if (r.ok) toast.success(`${label} link published`);
    else if (r.problems) toast.error("Not ready to publish yet");
    else toast.error(r.error ?? "Could not publish this link. Please try again.");
  });

  const open = useAsyncAction(async () => {
    setVersions(null);
    setSheet(true);
    const list = await loadVersions();
    if (list) setVersions(list);
    else toast.error("Could not load this link's versions. Please try again.");
  });

  const restore = useAsyncAction(async (version: number) => {
    const error = await onRestore(version);
    if (error) { toast.error(error); return; }
    toast.success(`Restored version ${version}`);
    setSheet(false);
  });

  const blocked = !mainLive || problems.length > 0 || saveState === "saving" || conflict || upToDate;
  const title = !mainLive
    ? MAIN_FIRST
    : problems.length > 0
      ? `${problems.length} checklist item${problems.length === 1 ? "" : "s"} to fix before publishing`
      : undefined;

  return (
    <>
      <span className="inline-flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
        <span>{live ? "This link is live" : "This link is not published yet"}</span>
        {conflict && <span>Someone else changed this link. Reload to see their changes first.</span>}
        {live && changed && (
          <span className="rounded-full bg-pz-secondary-container px-2 py-0.5 font-headline text-[11px] font-semibold text-pz-on-secondary-container">Unpublished changes</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => void open.run()}
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
        title={title}
        className="bg-pz-solid-forest text-white hover:bg-pz-solid-forest/90 disabled:opacity-100 disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant"
      >
        <Rocket aria-hidden="true" />
        {upToDate ? "Published" : "Publish"}
      </Button>

      {sheet && (
        <VersionsSheet onClose={() => setSheet(false)} subtitle={`Versions of the ${label} link. One is saved each time you publish it.`}>
          {versions === null ? (
            <p className="px-4 py-10 text-center font-body text-sm text-pz-on-surface-variant">Loading…</p>
          ) : (
            <VersionsPanel versions={versions} of="link" onRestore={(v) => void restore.run(v)} busy={restore.pending} />
          )}
        </VersionsSheet>
      )}
    </>
  );
}
