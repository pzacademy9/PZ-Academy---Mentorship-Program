"use client";

import { AlertTriangle, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Shown when a draft course is published while some sessions are missing a video or quiz. */
export function PublishConfirmDialog({
  open,
  lines,
  busy,
  onGoBack,
  onPublish,
}: {
  open: boolean;
  lines: string[];
  busy: boolean;
  onGoBack: () => void;
  onPublish: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onGoBack()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-pz-warning shrink-0" />
            {lines.length} sessions are not ready
          </DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Publishing now will make this course live to enrolled students, but some sessions are missing required
            content.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {lines.map((line) => (
            <li
              key={line}
              className="rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-3 py-2 text-sm font-medium text-pz-on-surface"
            >
              {line}
            </li>
          ))}
        </ul>
        <p className="text-xs text-pz-on-surface-variant">
          Students who reach these sessions before you add the materials will see a &ldquo;Content coming soon&rdquo;
          placeholder.
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="bare"
            size="bare"
            onClick={onGoBack}
            disabled={busy}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
          >
            Go back and fix
          </Button>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={busy}
            onClick={onPublish}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:opacity-90 transition-all inline-flex items-center justify-center gap-1.5"
          >
            Publish anyway
            <Check className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
