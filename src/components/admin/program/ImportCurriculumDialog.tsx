"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CurriculumChange, SessionPart } from "@/lib/lms/course-import/compare";
import { ImportChangeList, type ImportChangeItem } from "./ImportChangeList";

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-headline text-sm font-bold transition-colors disabled:opacity-50";
const FIELD =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3 font-mono text-xs text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

const PART_LABEL: Record<SessionPart, string> = {
  video: "Video",
  video2: "Second video",
  notes: "Notes",
  quiz: "Quiz",
};

type Group = { title: string; items: ImportChangeItem[] };

function toItem(c: CurriculumChange): ImportChangeItem {
  const base = { id: c.id, label: c.label };
  switch (c.kind) {
    case "update-session":
      return {
        ...base,
        from: c.rows.map((r) => `${PART_LABEL[r.part]}: ${r.from || "none"}`).join(", "),
        to: c.rows.map((r) => `${PART_LABEL[r.part]}: ${r.to || "none"}`).join(", "),
      };
    case "update-module-notes":
      return { ...base, from: c.from || "none", to: c.to || "none" };
    case "new-session":
      return { ...base, ...(c.note ? { note: c.note } : {}) };
    case "remove-session":
    case "remove-module":
      return { ...base, danger: true };
    default:
      return base;
  }
}

const isNew = (c: CurriculumChange) => c.kind === "new-module" || c.kind === "new-session";
const isRemove = (c: CurriculumChange) => c.kind === "remove-session" || c.kind === "remove-module";

function groupChanges(changes: CurriculumChange[]): Group[] {
  const groups: Group[] = [
    { title: "New", items: changes.filter(isNew).map(toItem) },
    { title: "Different", items: changes.filter((c) => !isNew(c) && !isRemove(c)).map(toItem) },
    { title: "Not in the file", items: changes.filter(isRemove).map(toItem) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

// Each row carries the fingerprint Check worked out; Apply sends it back.
type CheckedChange = CurriculumChange & { fingerprint?: string };
type Checked = { warnings: string[]; changes: CheckedChange[] };
type Done = { applied: number; notes: string[] };

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : [];
}

async function readErrorBody(res: Response, fallback: string): Promise<{ errors: string[]; applied: number; notes: string[] }> {
  const body = (await res.json().catch(() => null)) as { errors?: unknown; applied?: unknown; notes?: unknown } | null;
  const errs = strings(body?.errors);
  return {
    errors: errs.length > 0 ? errs : [fallback],
    applied: typeof body?.applied === "number" ? body.applied : 0,
    notes: strings(body?.notes),
  };
}

async function readErrors(res: Response, fallback: string): Promise<string[]> {
  return (await readErrorBody(res, fallback)).errors;
}

const savedText = (n: number) => `Done. ${n} ${n === 1 ? "change" : "changes"} saved.`;

/**
 * "Import curriculum from a file" in the Course Builder. The file is checked on
 * the server against the program as it stands. Nothing changes until Apply.
 */
export function ImportCurriculumDialog({
  open,
  onOpenChange,
  courseId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  onApplied: () => void;
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // True only while Apply is writing. The dialog cannot be closed then.
  const busyRef = useRef(false);
  const checkSeq = useRef(0);
  const removeIds = new Set((checked?.changes ?? []).filter(isRemove).map((c) => c.id));
  const removeTicked = Array.from(ticked).some((id) => removeIds.has(id));
  const base = `/api/admin/courses/${courseId}/import-curriculum`;

  // busyRef is left alone: only the Apply that set it clears it.
  function reset() {
    checkSeq.current += 1;
    setText("");
    setErrors([]);
    setChecked(null);
    setTicked(new Set());
    setConfirmRemove(false);
    setDone(null);
    setBusy(false);
  }

  async function check(value: string) {
    const seq = ++checkSeq.current;
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch(`${base}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (seq !== checkSeq.current) return;
      if (!res.ok) {
        const errs = await readErrors(res, "The file could not be checked. Please try again.");
        if (seq !== checkSeq.current) return;
        setChecked(null);
        setErrors(errs);
        return;
      }
      const body = (await res.json()) as { warnings?: string[]; changes?: CheckedChange[] };
      if (seq !== checkSeq.current) return;
      const changes = body.changes ?? [];
      setChecked({ warnings: body.warnings ?? [], changes });
      setTicked(new Set(changes.filter((c) => c.defaultOn).map((c) => c.id)));
      setConfirmRemove(false);
    } catch {
      if (seq !== checkSeq.current) return;
      setChecked(null);
      setErrors(["The file could not be checked. Please try again."]);
    } finally {
      if (seq === checkSeq.current) setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    // Closing the dialog moves the counter on, so a late read is dropped.
    const seq = checkSeq.current;
    try {
      const value = await file.text();
      if (seq !== checkSeq.current) return;
      setText(value);
      await check(value);
    } catch {
      if (seq !== checkSeq.current) return;
      setErrors(["That file could not be read. Try another file."]);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function apply() {
    if (busyRef.current) return;
    if (ticked.size === 0 || (removeTicked && !confirmRemove)) return;
    busyRef.current = true;
    setBusy(true);
    setErrors([]);
    const ids = Array.from(ticked);
    const fingerprints: Record<string, string> = {};
    for (const c of checked?.changes ?? []) {
      if (ticked.has(c.id) && c.fingerprint) fingerprints[c.id] = c.fingerprint;
    }
    try {
      const res = await fetch(`${base}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ids, fingerprints, ...(removeTicked && confirmRemove ? { confirmRemove: true } : {}) }),
      });
      if (!res.ok) {
        const failed = await readErrorBody(res, "Something went wrong. Please try again.");
        setErrors(failed.errors.concat(failed.notes));
        // Some changes were saved before the failure: the builder must show them,
        // and the rows are out of date, so go back to the start.
        if (failed.applied > 0) {
          setChecked(null);
          onApplied();
        } else if (res.status === 409) {
          setChecked(null);
        }
        return;
      }
      const body = (await res.json().catch(() => null)) as { applied?: number; notes?: unknown } | null;
      const n = body?.applied ?? ids.length;
      const notes = strings(body?.notes);
      toast.success(savedText(n));
      onApplied();
      if (notes.length > 0) {
        // Keep the dialog open so the admin can read what was kept.
        setChecked(null);
        setDone({ applied: n, notes });
        return;
      }
      reset();
      onOpenChange(false);
    } catch {
      setErrors(["Something went wrong. Please try again."]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const groups = checked ? groupChanges(checked.changes) : [];
  const canApply = ticked.size > 0 && (!removeTicked || confirmRemove) && !busy;

  // One shared ticked set. A group's Tick all / Untick all only touches its own rows.
  function changeGroup(ids: Set<string>, next: Set<string>) {
    const merged = new Set(Array.from(ticked).filter((id) => !ids.has(id)).concat(Array.from(next).filter((id) => ids.has(id))));
    setTicked(merged);
    // Re-ticking a remove row later must ask again.
    if (!Array.from(merged).some((id) => removeIds.has(id))) setConfirmRemove(false);
  }

  const errorList =
    errors.length > 0 ? (
      <ul role="alert" className="list-disc space-y-1 rounded-lg bg-pz-error-container px-6 py-3 font-body text-sm text-pz-on-error-container">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          // Closing while Apply is writing would let it be run a second time.
          if (busyRef.current) return;
          reset();
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Import curriculum from a file</DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Pick the file the AI gave you, or paste it. You will see what changes before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div role="status" className="space-y-2">
            <p className="font-headline text-sm font-bold text-pz-on-surface">{savedText(done.applied)}</p>
            <div className="space-y-1 rounded-lg bg-pz-surface-container px-3 py-2">
              <p className="font-headline text-sm font-bold text-pz-on-surface">Please note</p>
              <ul className="list-disc space-y-1 pl-5 font-body text-sm text-pz-on-surface [overflow-wrap:anywhere]">
                {done.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          </div>
        ) : !checked ? (
          <div className="space-y-3">
            <input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="sr-only" aria-label="Choose a file" onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} className={`${BTN} w-full border-2 border-dashed border-pz-outline-variant text-pz-primary hover:bg-pz-surface-container-low`}>
              <FileUp className="h-4 w-4" aria-hidden="true" /> Choose a file
            </button>
            <label htmlFor="import-curriculum-text" className="block font-body text-sm text-pz-on-surface-variant">Or paste the file here</label>
            <textarea id="import-curriculum-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="format: pz-course/1" className={FIELD} />
            {errorList}
          </div>
        ) : (
          <div className="space-y-4">
            {errorList}
            {checked.changes.length === 0 ? (
              <p role="status" className="font-body text-sm text-pz-on-surface">The file matches what is already in the program. Nothing would change.</p>
            ) : (
              <div className="space-y-4">
                <p className="font-headline text-sm font-bold text-pz-on-surface">What will change. Untick anything you do not want.</p>
                {groups.map((g) => {
                  const ids = new Set(g.items.map((i) => i.id));
                  return (
                    <section key={g.title} className="space-y-2">
                      <h3 className="font-headline text-sm font-bold text-pz-on-surface">{g.title}</h3>
                      <ImportChangeList items={g.items} checked={ticked} onChange={(next) => changeGroup(ids, next)} />
                    </section>
                  );
                })}
              </div>
            )}
            {removeTicked && (
              <div className="space-y-2 rounded-lg bg-pz-error-container px-3 py-2 font-body text-sm text-pz-on-error-container">
                <p>This deletes it for good. Students&apos; saved progress on it is lost.</p>
                <label className="flex cursor-pointer items-center gap-3 max-md:min-h-11">
                  <input type="checkbox" checked={confirmRemove} onChange={(e) => setConfirmRemove(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--pz-primary)]" />
                  <span>Yes, remove the ticked items</span>
                </label>
              </div>
            )}
            {checked.warnings.length > 0 && (
              <div className="space-y-1 rounded-lg bg-pz-surface-container px-3 py-2">
                <p className="font-headline text-sm font-bold text-pz-on-surface">Please note</p>
                <ul className="list-disc space-y-1 pl-5 font-body text-sm text-pz-on-surface">
                  {checked.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="font-body text-xs text-pz-on-surface-variant">
          No file yet? Get one from <Link href="/dashboard/admin/courses/ai" className="font-semibold text-pz-primary underline max-md:inline-block max-md:py-3">Make a course file with AI</Link>.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          {done ? (
            <Button type="button" variant="bare" size="bare" onClick={() => { reset(); onOpenChange(false); }} className={`${BTN} bg-pz-primary text-pz-on-primary`}>
              Close
            </Button>
          ) : !checked ? (
            <Button type="button" variant="bare" size="bare" disabled={!text.trim() || busy} onClick={() => check(text)} className={`${BTN} bg-pz-primary text-pz-on-primary`}>
              Check the file
            </Button>
          ) : (
            <>
              <Button type="button" variant="bare" size="bare" disabled={busy} onClick={() => { setChecked(null); setErrors([]); }} className={`${BTN} border border-pz-outline-variant text-pz-on-surface`}>
                Back
              </Button>
              <Button type="button" variant="bare" size="bare" disabled={!canApply} onClick={apply} className={`${BTN} bg-pz-primary text-pz-on-primary`}>
                Apply the ticked changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
