"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Lightbulb } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { slugify, validateSlug } from "@/lib/landing/slug";
import type { LandingPageSummary } from "@/lib/data/landing-pages";
import { PageLinkField } from "./PageLinkField";
import { StatusBadge } from "./StatusBadge";

const MAX_NAME = 120;
const FIELD_LABEL = "font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";

function DuplicateForm({ page, onDone }: { page: LandingPageSummary; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${page.title} (copy)`);
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slug = slugOverride ?? slugify(name);
  const canSubmit = name.trim().length > 0 && validateSlug(slug).ok;

  const { run: submit, pending } = useAsyncAction(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/landing-pages/${page.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim(), slug }),
      });
      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) {
        setError(payload?.error ?? "Could not duplicate the page. Please try again.");
        return;
      }
      onDone();
      router.push(`/dashboard/admin/landing-pages/${payload.id}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit(); }} className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl bg-pz-surface-container-high p-3">
        <Copy className="h-5 w-5 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={FIELD_LABEL}>Source page</p>
          <p className="truncate text-sm font-semibold text-pz-on-surface">{page.title}</p>
        </div>
        <StatusBadge status={page.status} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="dup-page-name" className={FIELD_LABEL}>Page name</Label>
          <span className="text-xs tabular-nums text-pz-on-surface-variant">{name.length} / {MAX_NAME}</span>
        </div>
        <Input
          id="dup-page-name"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => { setName(e.target.value); setSlugOverride(null); setError(null); }}
          className="h-10 max-md:min-h-11"
        />
      </div>

      <PageLinkField slug={slug} onChange={(s) => { setSlugOverride(s); setError(null); }} showValidation />

      <p className="flex items-start gap-2 text-xs text-pz-on-surface-variant">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Duplicating a published page creates a safe draft, ready for revisions. The original stays untouched.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-pz-error-container px-3 py-2 text-sm text-pz-on-error-container">{error}</p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          disabled={!canSubmit || pending}
          className="disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:opacity-100"
        >
          <Copy aria-hidden="true" />
          {pending ? "Duplicating…" : "Duplicate page"}
        </Button>
      </div>
    </form>
  );
}

export function DuplicatePageDialog({
  page, open, onOpenChange,
}: { page: LandingPageSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-pz-surface-container-lowest">
        <DialogHeader>
          <p className="font-headline text-xs font-bold uppercase tracking-wide text-pz-primary">Fast replication</p>
          <DialogTitle className="font-headline text-xl text-pz-on-surface">Duplicate page</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            Create an exact copy of this page to edit as a new draft.
          </DialogDescription>
        </DialogHeader>
        <DuplicateForm page={page} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
