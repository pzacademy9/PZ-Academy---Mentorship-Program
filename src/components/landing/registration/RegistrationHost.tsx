"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { onOpenRegistration } from "./registration-bus";

const RegistrationModal = lazy(() => import("./RegistrationModal"));

/** Mounted once per public page. Loads the modal code on the first open and keeps it mounted so a closed-then-reopened form keeps its answers. */
export function RegistrationHost({ slug, tracking = true }: { slug: string; tracking?: boolean }) {
  const [everOpened, setEverOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => onOpenRegistration(() => { setEverOpened(true); setOpen(true); }), []);
  return (
    <div ref={setContainer} className="font-landing-body">
      {everOpened && (
        <Suspense fallback={<OpeningNotice />}>
          <RegistrationModal slug={slug} open={open} onClose={() => setOpen(false)} tracking={tracking} portalContainer={container} />
        </Suspense>
      )}
    </div>
  );
}

function OpeningNotice() {
  return (
    <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-landing-near-black/50">
      <span className="rounded-landing bg-landing-surface-container-lowest px-5 py-3 font-headline text-sm font-bold text-landing-deep shadow-landing-soft-lg">Opening registration…</span>
    </div>
  );
}
