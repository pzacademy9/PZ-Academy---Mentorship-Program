"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NotInterestedDialog({
  open,
  onChoose,
  onCancel,
}: {
  open: boolean;
  onChoose: (choice: "stop" | "not-interested") => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md font-body">
        <DialogTitle className="pr-8 font-headline text-lg text-pz-on-surface">Did they ask you to stop messaging them?</DialogTitle>
        <DialogDescription className="text-pz-on-surface-variant">
          If they asked you to stop, nobody will be able to message them again from the app.
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" variant="bare" size="bare" onClick={() => onChoose("stop")}
            className="w-full min-h-11 px-4 rounded-lg bg-pz-error-container text-pz-on-error-container font-headline font-bold text-sm">
            They asked me to stop
          </Button>
          <Button type="button" variant="bare" size="bare" onClick={() => onChoose("not-interested")}
            className="w-full min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">
            Just not interested
          </Button>
          <Button type="button" variant="bare" size="bare" onClick={onCancel}
            className="w-full min-h-11 px-4 rounded-lg text-pz-on-surface-variant font-headline text-sm">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
