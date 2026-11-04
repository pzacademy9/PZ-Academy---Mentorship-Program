/**
 * Shared button looks for the public website (Stitch "PZ Academy Platform 2").
 * All are pills at least 44px tall. Text colours use the constant solid-*
 * tokens so they stay readable in dark mode.
 */
const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 font-montserrat text-[15px] font-bold tracking-[-0.01em] transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Lime pill — the one main action on a screen. */
export const BTN_PRIMARY = `${BASE} bg-pz-bright text-pz-solid-deep shadow-[0_8px_24px_rgba(126,217,87,0.3)] hover:scale-[1.02] hover:brightness-105 focus-visible:outline-pz-bright`;

/** Quiet pill for dark bands: soft white tint on phones, plain text on wider screens. */
export const BTN_GHOST_DARK = `${BASE} bg-white/10 text-white hover:bg-white/15 sm:bg-transparent sm:hover:bg-white/10 focus-visible:outline-white`;

/** Solid deep-green pill for light sections. */
export const BTN_SOLID = `${BASE} bg-pz-solid-deep text-white hover:bg-pz-solid-forest focus-visible:outline-pz-solid-mid`;
