"use client";

import { useRef, useState } from "react";
import type { FieldErrors, FormState } from "@/lib/landing/registration/form-state";
import { VOUCHER_TYPES } from "@/lib/landing/registration/form-state";
import { ConsentField } from "./Field";
import { R_BTN_SECONDARY, R_ERROR, R_HINT } from "./ui";

export function StepUpload({
  state, errors, preparing, onFile, onConsent,
}: { state: FormState; errors: FieldErrors; preparing: boolean; onFile: (f: File | null) => void; onConsent: (v: boolean) => void }) {
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const f = state.voucher;
  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files?.[0]; if (file) onFile(file); }}
        className={`rounded-landing border-2 border-dashed p-5 text-center ${over ? "border-landing-primary bg-landing-mint-light" : "border-landing-outline-variant bg-landing-surface-container-lowest"}`}
      >
        <p className="font-headline text-base font-bold text-landing-near-black">Upload your payment receipt</p>
        <p className={R_HINT}>A screenshot or photo (JPG, PNG, WebP) or a PDF, under 4 MB.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className={R_BTN_SECONDARY + " md:hidden"} onClick={() => camera.current?.click()}>Take photo</button>
          <button type="button" className={R_BTN_SECONDARY} onClick={() => pick.current?.click()}>Choose file</button>
        </div>
        <input ref={pick} type="file" accept={VOUCHER_TYPES.join(",")} aria-label="Payment screenshot or receipt" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" aria-label="Take a photo of your receipt" className="sr-only" tabIndex={-1} onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {preparing && <p role="status" className={R_HINT}>Preparing your photo…</p>}
        {f && !preparing && (
          <p className="mt-3 flex items-center justify-center gap-2 font-landing-body text-base text-landing-on-surface">
            <span aria-hidden="true" className="text-landing-primary">✓</span>
            <span className="break-all font-semibold">{f.name}</span>
            <button type="button" onClick={() => onFile(null)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">Remove</button>
          </p>
        )}
        {errors.voucher && <span role="alert" className={R_ERROR}>{errors.voucher}</span>}
      </div>
      <ConsentField checked={state.consent} onChange={onConsent} error={errors.consent} />
    </div>
  );
}
