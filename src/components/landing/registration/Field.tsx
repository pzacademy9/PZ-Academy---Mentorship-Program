"use client";

import { useId } from "react";
import { R_ERROR, R_HINT, R_INPUT, R_LABEL } from "./ui";

type Common = { label: string; error?: string; hint?: string; ariaLabel?: string; name?: string };

export function TextField({
  label, error, hint, ariaLabel, value, onChange, type = "text", inputMode, autoComplete, readOnly, placeholder, name, maxLength,
}: Common & {
  value: string; onChange: (v: string) => void; type?: "text" | "email" | "tel";
  inputMode?: "text" | "email" | "tel" | "numeric"; autoComplete?: string; readOnly?: boolean; placeholder?: string; maxLength?: number;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={R_LABEL}>{label}</label>
      {hint && <span id={`${id}-hint`} className={R_HINT}>{hint}</span>}
      <input
        id={id} name={name} type={type} inputMode={inputMode} autoComplete={autoComplete} readOnly={readOnly}
        placeholder={placeholder} maxLength={maxLength} value={value} aria-label={ariaLabel} aria-invalid={error ? true : undefined}
        aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} className={R_INPUT}
      />
      {error && <span id={`${id}-err`} role="alert" className={R_ERROR}>{error}</span>}
    </div>
  );
}

export function SelectField({
  label, error, hint, ariaLabel, value, onChange, options, placeholder = "Choose…",
}: Common & { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={R_LABEL}>{label}</label>
      {hint && <span id={`${id}-hint`} className={R_HINT}>{hint}</span>}
      <select id={id} value={value} aria-label={ariaLabel} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} className={R_INPUT}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <span id={`${id}-err`} role="alert" className={R_ERROR}>{error}</span>}
    </div>
  );
}

export function ConsentField({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  const id = useId();
  return (
    <div>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 font-landing-body text-base text-landing-on-surface">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className="mt-1 h-5 w-5 shrink-0 accent-landing-primary" />
        <span>I have read and understood the registration details, payment terms and schedule.</span>
      </label>
      {error && <span id={`${id}-err`} role="alert" className={R_ERROR}>{error}</span>}
    </div>
  );
}
