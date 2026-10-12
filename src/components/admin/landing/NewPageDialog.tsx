"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, FlaskConical, Video, Rocket, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/lib/landing/templates";
import { slugify, validateSlug } from "@/lib/landing/slug";
import type { PageKind } from "@/lib/landing/content";
import { PageLinkField } from "./PageLinkField";

const KINDS: { kind: PageKind; label: string; hint: string; icon: typeof GraduationCap }[] = [
  { kind: "course", label: "Course", hint: "Long-form cohort", icon: GraduationCap },
  { kind: "workshop", label: "Workshop", hint: "Simulated lab", icon: FlaskConical },
  { kind: "webinar", label: "Webinar", hint: "Live broadcast", icon: Video },
];
const MAX_NAME = 120;
const SELECT =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm text-pz-on-surface shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11";
const FIELD_LABEL = "font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant";

function blankFor(kind: PageKind) {
  return `blank-${kind}`;
}

function NewPageForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<PageKind>("course");
  const [name, setName] = useState("");
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(blankFor("course"));
  const [error, setError] = useState<string | null>(null);

  const slug = slugOverride ?? slugify(name);
  const slugOk = validateSlug(slug).ok;
  const templates = TEMPLATES.filter((t) => t.kind === kind);
  const selected = templates.find((t) => t.id === templateId);
  const seeded = !!selected && selected.id !== blankFor(kind);
  const canSubmit = name.trim().length > 0 && slugOk;

  function pickKind(next: PageKind) {
    setKind(next);
    setTemplateId(blankFor(next));
    setError(null);
  }

  const { run: submit, pending } = useAsyncAction(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/landing-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim(), kind, slug, templateId }),
      });
      const payload = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !payload?.id) {
        setError(payload?.error ?? "Could not create the page. Please try again.");
        return;
      }
      onDone();
      router.push(`/dashboard/admin/landing-pages/${payload.id}`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit(); }}
      className="space-y-5"
    >
      <fieldset className="space-y-2">
        <legend className={cn(FIELD_LABEL, "mb-2")}>
          1. Select page type <span className="font-normal normal-case">(required)</span>
        </legend>
        <div role="radiogroup" aria-label="Page type" className="grid grid-cols-3 gap-2">
          {KINDS.map(({ kind: k, label, hint, icon: Icon }) => {
            const active = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pickKind(k)}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-colors max-md:min-h-11",
                  active
                    ? "border-pz-primary bg-pz-primary-container/30"
                    : "border-pz-outline-variant bg-pz-surface-container-lowest hover:bg-pz-surface-container-high",
                )}
              >
                {active && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pz-primary-container text-pz-on-primary-container">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                )}
                <Icon className="h-6 w-6 text-pz-on-surface" aria-hidden="true" />
                <span className="font-headline text-sm font-bold text-pz-on-surface">{label}</span>
                <span className="text-xs text-pz-on-surface-variant">{hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="new-page-name" className={FIELD_LABEL}>Page name</Label>
          <span className="text-xs tabular-nums text-pz-on-surface-variant">{name.length} / {MAX_NAME}</span>
        </div>
        <Input
          id="new-page-name"
          value={name}
          maxLength={MAX_NAME}
          placeholder="e.g. PPC Batch 4"
          onChange={(e) => { setName(e.target.value); setSlugOverride(null); setError(null); }}
          className="h-10 max-md:min-h-11"
        />
        <p className="text-xs text-pz-on-surface-variant">Visible in the browser tab and search engines. You can change it any time.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-page-template" className={FIELD_LABEL}>Start from</Label>
        <select id="new-page-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={SELECT}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {selected && <p className="text-xs text-pz-on-surface-variant">{selected.description}</p>}
        {seeded && (
          <p className="text-xs text-pz-on-surface-variant">
            Dates, prices and the Register link come from the original page. Update them before publishing.
          </p>
        )}
      </div>

      <PageLinkField slug={slug} onChange={(s) => { setSlugOverride(s); setError(null); }} showValidation={name.trim().length > 0 || slugOverride !== null} />

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
          <Rocket aria-hidden="true" />
          {pending ? "Creating…" : "Create page"}
        </Button>
      </div>
    </form>
  );
}

export function NewPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-pz-surface-container-lowest">
        <DialogHeader>
          <p className="font-headline text-xs font-bold uppercase tracking-wide text-pz-primary">Page builder</p>
          <DialogTitle className="font-headline text-xl text-pz-on-surface">Create a new page</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            Choose a page type, name it and start from a blank page or a copy of an existing one.
          </DialogDescription>
        </DialogHeader>
        <NewPageForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
