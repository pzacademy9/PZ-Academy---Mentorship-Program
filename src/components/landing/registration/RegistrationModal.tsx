// STUB (Task 17). Task 18 replaces this file with the real flow; keep the props and both exports.
"use client";

import * as Dialog from "@radix-ui/react-dialog";

export interface RegistrationModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  testMode?: boolean;
  tracking?: boolean;
  portalContainer?: HTMLElement | null;
}

export function RegistrationModal({ open, onClose, portalContainer }: RegistrationModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-landing-near-black/60" />
        <Dialog.Content className="fixed inset-0 z-50 bg-landing-surface p-6 md:inset-auto md:left-1/2 md:top-1/2 md:w-[960px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-landing">
          <Dialog.Title className="font-headline text-lg font-bold text-landing-deep">Register</Dialog.Title>
          <Dialog.Description className="text-landing-on-surface-variant">Loading the registration form…</Dialog.Description>
          <Dialog.Close className="mt-4 rounded-landing border border-landing-outline-variant px-4 py-2">Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default RegistrationModal;
