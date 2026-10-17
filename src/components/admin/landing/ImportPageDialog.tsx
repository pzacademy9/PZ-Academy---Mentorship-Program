"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MAX_CHARS = 400_000;
const FIELD_LABEL = "font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";
const NETWORK_ERROR = "Could not reach the server. Please try again.";
const MAYBE_DONE = "The import may not have finished. Check the Landing Pages list before trying again.";
const TOO_BIG_FILE = "That file is too big to import";

type ImportResult = {
  pageId: string;
  slug: string;
  slugChanged: boolean;
  warnings: string[];
  linksCreated: number;
  linksFailed: string[];
};

export function ImportPageDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inFlight = useRef(false);

  function finish() {
    if (loading) return;
    if (result) router.refresh();
    onClose();
  }

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    setErrors([]);
    setNotice(null);
    try {
      if (file.size > MAX_CHARS) {
        setNotice(TOO_BIG_FILE);
      } else {
        setText(await file.text());
      }
    } catch {
      setNotice("Could not read that file. Please try another one.");
    } finally {
      input.value = ""; // lets the same file be chosen again
    }
  }

  async function submit() {
    setErrors([]);
    setNotice(null);
    if (text.length > MAX_CHARS) {
      setNotice("This text is too long to import (the limit is 400,000 characters). Please shorten it.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/landing-pages/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: text }),
      });
      const payload = (await res.json().catch(() => null)) as (Partial<ImportResult> & { errors?: unknown }) | null;
      if (res.status === 201 && payload && typeof payload.pageId === "string") {
        setResult({
          pageId: payload.pageId,
          slug: String(payload.slug ?? ""),
          slugChanged: !!payload.slugChanged,
          warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
          linksCreated: Number(payload.linksCreated ?? 0),
          linksFailed: Array.isArray(payload.linksFailed) ? payload.linksFailed.map(String) : [],
        });
      } else if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
        setErrors(payload.errors.map(String));
      } else {
        // The server answered but not with a readable result (for example a timeout page): the page may exist.
        setNotice(MAYBE_DONE);
      }
    } catch {
      setNotice(NETWORK_ERROR);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent
        className="max-w-xl bg-pz-surface-container-lowest"
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (loading) e.preventDefault(); }}
      >
        <DialogHeader>
          <p className="font-headline text-xs font-bold uppercase tracking-wide text-pz-primary">Page builder</p>
          <DialogTitle className="font-headline text-xl text-pz-on-surface">Import a page</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            Choose a .md or .txt file, or paste the page text below. The page is created as a draft.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <p className="font-headline text-base font-bold text-pz-on-surface">Page created as a draft.</p>
            <ul className="space-y-1 text-sm text-pz-on-surface">
              <li>Link name: <span className="font-mono">{result.slug}</span></li>
              {result.slugChanged && (
                <li>The link name was already taken, so it was changed to {result.slug}.</li>
              )}
              <li>{result.linksCreated} {result.linksCreated === 1 ? "link" : "links"} created</li>
            </ul>
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                <p className={FIELD_LABEL}>Check these</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-pz-on-surface">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            {result.linksFailed.length > 0 && (
              <p role="alert" className="rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">
                These links could not be created: {result.linksFailed.join(", ")}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={finish}>Close</Button>
              <Button type="button" onClick={() => router.push(`/dashboard/admin/landing-pages/${result.pageId}`)}>
                Open page
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); if (text.trim() && !loading) void submit(); }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="import-page-file" className={FIELD_LABEL}>File</Label>
              <input
                id="import-page-file"
                type="file"
                accept=".md,.txt"
                disabled={loading}
                onChange={(e) => void onFile(e.currentTarget)}
                className="block w-full text-sm text-pz-on-surface file:mr-3 file:rounded-md file:border-0 file:bg-pz-surface-container-high file:px-3 file:py-2 file:text-sm file:font-medium file:text-pz-on-surface max-md:min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-page-text" className={FIELD_LABEL}>Page text</Label>
              <textarea
                id="import-page-text"
                value={text}
                disabled={loading}
                rows={10}
                onChange={(e) => { setText(e.target.value); setNotice(null); }}
                placeholder="Paste the page text here"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs text-pz-on-surface shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {errors.length > 0 && (
              <div role="alert" className="space-y-1 rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">
                <p className="font-semibold">Could not import. Fix these and try again:</p>
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((er, i) => <li key={i}>{er}</li>)}
                </ul>
              </div>
            )}
            {notice && (
              <p role="alert" className="rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">{notice}</p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={finish} disabled={loading}>Cancel</Button>
              <Button
                type="submit"
                disabled={!text.trim() || loading}
                className="disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:opacity-100"
              >
                <Upload aria-hidden="true" />
                {loading ? "Importing…" : "Import page"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
