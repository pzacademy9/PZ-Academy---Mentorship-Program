/**
 * Shared button looks for the public website. All are 44px+ tall pills.
 * Text colours use the constant solid-* tokens so they stay readable in dark mode.
 */
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-7 py-3 font-poppins text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Lime pill — the one main action on a screen. */
export const BTN_PRIMARY = `${BASE} bg-pz-bright text-pz-solid-deep hover:brightness-105 hover:shadow-[0_10px_28px_rgba(126,217,87,.35)] focus-visible:outline-pz-bright`;

/** Outline pill for dark bands. */
export const BTN_GHOST_DARK = `${BASE} border border-white/30 text-white hover:border-pz-bright hover:text-pz-bright focus-visible:outline-white`;

/** Solid green pill for light sections. */
export const BTN_SOLID = `${BASE} bg-pz-solid-forest text-white hover:bg-pz-solid-mid hover:shadow-card focus-visible:outline-pz-solid-mid`;
