// src/components/landing/RegisterButton.tsx
import { isSafeUrl } from "@/lib/landing/simple-text";
import { RegistrationLauncher } from "./registration/RegistrationLauncher";

export interface Register { url: string; label: string; closed: boolean; /** true on the public page when the built-in form is on */ builtIn?: boolean }

type Variant = "primary" | "mint" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-landing-primary text-landing-on-primary shadow-landing-soft hover:bg-landing-primary-hover",
  mint: "bg-landing-mint text-landing-deep shadow-landing-soft-lg hover:bg-landing-on-primary",
  outline: "border-2 border-landing-primary text-landing-primary hover:bg-landing-primary/5",
};
const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 text-xs md:px-6 md:py-3 md:text-sm",
  md: "px-6 py-3.5 text-sm",
  lg: "px-8 py-4 text-base",
};
const BASE = "inline-flex items-center justify-center gap-2 rounded-landing text-center font-headline font-bold transition active:scale-95";

/** Empty / whitespace-only labels always fall back to "Register now". */
export function ctaLabel(label: unknown, fallback = "Register now"): string {
  const t = typeof label === "string" ? label.trim() : "";
  return t || fallback.trim() || "Register now";
}

/**
 * The single place a Register button is rendered. Closed pages get a non-link notice; an
 * unsafe or missing URL gets a disabled-looking span (never an anchor).
 */
export function RegisterButton({
  register, label, variant = "primary", size = "md", arrow = false, className = "", announce = false,
}: { register: Register; label?: string; variant?: Variant; size?: Size; arrow?: boolean; className?: string; announce?: boolean }) {
  if (register.closed) {
    // Every Register slot shows the notice, but only one (announce: the header's) is a live region,
    // so a screen reader says "Registration is closed" once, not once per button.
    return (
      <span {...(announce ? { role: "status" } : {})} className={`inline-flex items-center justify-center rounded-landing border border-landing-outline-variant bg-landing-surface-container-low px-4 py-2 text-center text-xs font-semibold text-landing-on-surface-variant md:text-sm ${className}`}>
        Registration is closed
      </span>
    );
  }
  const text = ctaLabel(label, register.label);
  const classes = `${BASE} ${SIZE[size]} ${className}`;
  const arrowIcon = arrow ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ) : null;
  if (register.builtIn) {
    return (
      <RegistrationLauncher className={`${classes} ${VARIANT[variant]}`}>
        <span>{text}</span>
        {arrowIcon}
      </RegistrationLauncher>
    );
  }
  if (!isSafeUrl(register.url)) {
    return <span aria-disabled="true" className={`${classes} cursor-not-allowed bg-landing-surface-container-low text-landing-on-surface-variant opacity-70`}>{text}</span>;
  }
  return (
    <a href={register.url} className={`${classes} ${VARIANT[variant]}`}>
      <span>{text}</span>
      {arrowIcon}
    </a>
  );
}
