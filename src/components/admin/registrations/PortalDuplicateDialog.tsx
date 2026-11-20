"use client";

import { useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callPortal } from "@/lib/portal-client";
import type { PortalSummary } from "@/lib/data/portals";

const field =
  "w-full rounded-lg bg-pz-surface-container-low px-3.5 py-2.5 max-md:min-h-11 font-body text-sm max-md:text-base text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/40";
const label = "block font-label text-xs font-semibold text-pz-primary uppercase tracking-wide mb-1.5";

export function PortalDuplicateDialog({
  open,
  onOpenChange,
  pageId,
  sources,
  families,
  onDone,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  sources: PortalSummary[];
  families: { id: string; name: string }[];
  onDone: () => void;
  /** Button to give focus back to when the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [newFamily, setNewFamily] = useState("");
  const [batchLabel, setBatchLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = source !== "" && title.trim() !== "" && !busy;

  async function copy() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = await callPortal<{ courseId: string }>("/api/admin/landing/portal/duplicate", {
      pageId,
      sourceCourseId: source,
      title: title.trim(),
      familyId: familyId || null,
      newFamilyName: newFamily.trim() || null,
      batchLabel: batchLabel.trim() || null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!returnFocusRef?.current) return;
          e.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Duplicate a portal</DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Copies a portal with all its modules and gives this batch the copy. Nobody is moved or emailed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="dup-source" className={label}>Portal to copy</label>
            <select id="dup-source" value={source} onChange={(e) => setSource(e.target.value)} className={field}>
              <option value="">Choose a portal</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dup-title" className={label}>Name of the new portal</label>
            <input id="dup-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={field} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="dup-family" className={label}>Group</label>
              <select id="dup-family" value={familyId} onChange={(e) => setFamilyId(e.target.value)} className={field}>
                <option value="">No group</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dup-batch" className={label}>Batch label</label>
              <input id="dup-batch" value={batchLabel} maxLength={60} onChange={(e) => setBatchLabel(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="dup-newfamily" className={label}>Or a new group name</label>
            <input id="dup-newfamily" value={newFamily} maxLength={60} onChange={(e) => setNewFamily(e.target.value)} className={field} />
          </div>
          {error && (
            <p role="alert" className="font-body text-sm text-pz-danger">{error}</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => void copy()}
            className="inline-flex items-center justify-center px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Copying…" : "Copy portal"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
