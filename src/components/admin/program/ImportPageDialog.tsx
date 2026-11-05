"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { analyzePageFile, type PageImport } from "@/lib/lms/course-import/analyze";
import { pageImportChanges, type EditorPage, type PageChange } from "@/lib/lms/course-import/page-changes";

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-headline text-sm font-bold transition-colors disabled:opacity-50";
const FIELD =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3 font-mono text-xs text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

type Checked = { plan: PageImport; warnings: string[]; changes: PageChange[] };

/**
 * "Import page from a file" in the course editor. The file is checked in the
 * browser; "Fill in" only fills the editor's boxes. Nothing is saved until Save.
 */
export function ImportPageDialog({
  open,
  onOpenChange,
  courseType,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseType: string;
  current: EditorPage;
  onApply: (plan: PageImport) => void;
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState<Checked | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setErrors([]);
    setChecked(null);
  }

  function check(value: string) {
    const r = analyzePageFile(value, courseType);
    if (!r.ok) {
      setChecked(null);
      setErrors(r.errors);
      return;
    }
    setErrors([]);
    setChecked({ plan: r.plan, warnings: r.warnings, changes: pageImportChanges(current, r.plan) });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const value = await file.text();
      setText(value);
      check(value);
    } catch {
      setErrors(["That file could not be read. Try another file."]);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">Import page from a file</DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Pick the file the AI gave you, or paste it. You will see what changes before anything is filled in. Nothing is saved until you press Save.
          </DialogDescription>
        </DialogHeader>

        {!checked ? (
          <div className="space-y-3">
            <input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" className="sr-only" aria-label="Choose a file" onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} className={`${BTN} w-full border-2 border-dashed border-pz-outline-variant text-pz-primary hover:bg-pz-surface-container-low`}>
              <FileUp className="h-4 w-4" aria-hidden="true" /> Choose a file
            </button>
            <label htmlFor="import-page-text" className="block font-body text-sm text-pz-on-surface-variant">Or paste the file here</label>
            <textarea id="import-page-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="format: pz-course/1" className={FIELD} />
            {errors.length > 0 && (
              <ul role="alert" className="list-disc space-y-1 rounded-lg bg-pz-error-container px-6 py-3 font-body text-sm text-pz-on-error-container">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <p className="font-body text-xs text-pz-on-surface-variant">
              No file yet? Get one from <Link href="/dashboard/admin/courses/ai" className="font-semibold text-pz-primary underline">Make a course page with AI</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {checked.changes.length === 0 ? (
              <p role="status" className="font-body text-sm text-pz-on-surface">The file matches what is already in the editor. Nothing would change.</p>
            ) : (
              <div className="space-y-2">
                <p className="font-headline text-sm font-bold text-pz-on-surface">What will change</p>
                <ul aria-label="What will change" className="divide-y divide-pz-outline-variant rounded-lg border border-pz-outline-variant">
                  {checked.changes.map((c) => (
                    <li key={c.label} className="space-y-0.5 px-3 py-2 font-body text-sm">
                      <p className="font-semibold text-pz-on-surface">{c.label}</p>
                      <p className="break-words text-pz-on-surface-variant">
                        <span className="line-through">{c.from}</span> <span aria-hidden="true">→</span>
                        <span className="sr-only"> becomes </span> <span className="text-pz-on-surface">{c.to}</span>
                      </p>
                    </li>
                  ))}
                </ul>
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

        <DialogFooter className="gap-2 sm:gap-2">
          {!checked ? (
            <Button type="button" variant="bare" size="bare" disabled={!text.trim()} onClick={() => check(text)} className={`${BTN} bg-pz-primary text-pz-on-primary`}>
              Check the file
            </Button>
          ) : (
            <>
              <Button type="button" variant="bare" size="bare" onClick={() => setChecked(null)} className={`${BTN} border border-pz-outline-variant text-pz-on-surface`}>
                Back
              </Button>
              <Button
                type="button"
                variant="bare"
                size="bare"
                disabled={checked.changes.length === 0}
                onClick={() => {
                  onApply(checked.plan);
                  reset();
                  onOpenChange(false);
                }}
                className={`${BTN} bg-pz-primary text-pz-on-primary`}
              >
                Fill in the boxes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
