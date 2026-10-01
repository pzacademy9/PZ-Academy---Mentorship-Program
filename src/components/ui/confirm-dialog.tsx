"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If set, runs inside the dialog with a busy confirm button; resolves true after it settles. */
  onConfirm?: () => Promise<void>;
};

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ opts, resolve })),
    [],
  );

  const settle = useCallback((value: boolean) => {
    setPending((p) => {
      p?.resolve(value);
      return null;
    });
  }, []);

  async function handleConfirm() {
    if (!pending || busyRef.current) return;
    const { onConfirm } = pending.opts;
    if (!onConfirm) return settle(true);
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
      settle(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const opts = pending?.opts;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open && !busyRef.current) settle(false); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="pr-8 font-headline text-lg">{opts?.title}</DialogTitle>
          {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          <div className="flex flex-col-reverse gap-2 pt-2 md:flex-row md:justify-end">
            <Button variant="outline" disabled={busy} onClick={() => settle(false)} className="max-md:w-full">
              {opts?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={opts?.destructive ? "destructive" : "default"}
              loading={busy}
              onClick={handleConfirm}
              className="max-md:w-full"
            >
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
