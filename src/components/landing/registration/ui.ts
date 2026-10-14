// Public registration UI: landing-* tokens only, 16px inputs, 44px+ touch targets.
export const R_LABEL = "block font-headline text-sm font-bold text-landing-near-black";
export const R_HINT = "block font-landing-body text-sm text-landing-muted";
// Validation text is always words (never colour alone); the colour is the one `error` token on the landing palette.
export const R_ERROR = "mt-1 block font-landing-body text-sm font-semibold text-landing-error";
export const R_INPUT =
  "mt-1.5 block min-h-12 w-full rounded-landing border border-landing-outline-variant bg-landing-surface-container-lowest px-3.5 py-2.5 font-landing-body text-base text-landing-on-surface placeholder:text-landing-muted focus:border-landing-primary focus:outline-none focus:ring-2 focus:ring-landing-mint aria-[invalid=true]:border-landing-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-landing-error read-only:bg-landing-surface-container-low";
export const R_CARD = "rounded-landing border border-landing-border bg-landing-surface-container-lowest p-4";
export const R_CHOICE =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-landing border-2 border-landing-border bg-landing-surface-container-lowest p-3.5 transition-colors has-[:checked]:border-landing-primary has-[:checked]:bg-landing-mint-light has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-landing-mint";
export const R_BTN_PRIMARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-landing bg-landing-primary px-6 font-headline text-base font-bold text-landing-on-primary shadow-landing-soft hover:bg-landing-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:scale-95";
export const R_BTN_SECONDARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-landing border-2 border-landing-primary px-5 font-headline text-base font-bold text-landing-primary hover:bg-landing-mint-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint disabled:opacity-60";
