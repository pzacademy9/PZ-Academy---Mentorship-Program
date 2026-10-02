// Single source of truth for the pz-* palette. Tailwind reads it (colours +
// generated CSS variables), tests read it (completeness). `light` values are
// the original hex values, unchanged; `dark` comes from the Stitch "PZ Academy
// Feedback System" dark palette, adapted by how each token is used.
// A token with no `dark` is intentionally identical in both themes.
export type PzToken = { light: string; dark?: string };

export const PZ_TOKENS: Record<string, PzToken> = {
  // Brand greens. As TEXT these must lighten in dark; as BACKGROUNDS they are
  // constant, which is what the `solid-*` twins below are for (Task 3).
  deep: { light: "#0F3D22", dark: "#C8F0A0" },
  forest: { light: "#194B32", dark: "#B4E08C" },
  mid: { light: "#196432", dark: "#8FD47A" },
  bright: { light: "#7ED957" },
  pale: { light: "#C8F0A0", dark: "#265235" },
  offwhite: { light: "#F7FAF5", dark: "#10150C" },
  pine: { light: "#0F3D22", dark: "#C8F0A0" },
  sage: { light: "#196432", dark: "#8FD47A" },
  lime: { light: "#7ED957" },
  mint: { light: "#C8F0A0", dark: "#265235" },
  frost: { light: "#F7FAF5", dark: "#10150C" },
  "solid-deep": { light: "#0F3D22" },
  "solid-forest": { light: "#194B32" },
  "solid-mid": { light: "#196432" },
  "solid-pine": { light: "#0F3D22" },
  "solid-sage": { light: "#196432" },
  gold: { light: "#C9960A" },
  "gold-light": { light: "#E8B84B" },
  maroon: { light: "#3D0A0A" },
  ink: { light: "#1A2E1F", dark: "#DFE5D6" },
  muted: { light: "#4D6B54", dark: "#A9B8A5" },
  border: { light: "#D4EACC", dark: "#404A3A" },
  success: { light: "#10B981" },
  warning: { light: "#F59E0B" },
  danger: { light: "#EF4444" },

  // Stitch semantic tokens.
  primary: { light: "#246d00", dark: "#99f670" },
  "on-primary": { light: "#ffffff", dark: "#0f3900" },
  "primary-container": { light: "#7ed957" },
  "on-primary-container": { light: "#1d5d00" },
  "primary-fixed": { light: "#9cf973" },
  "primary-fixed-dim": { light: "#81dc5a" },
  "on-primary-fixed": { light: "#062100" },
  "on-primary-fixed-variant": { light: "#195200" },
  secondary: { light: "#7a5900", dark: "#f6be3b" },
  "on-secondary": { light: "#ffffff", dark: "#3a2800" },
  "secondary-container": { light: "#ffc644" },
  "on-secondary-container": { light: "#715300" },
  "secondary-fixed": { light: "#ffdea1" },
  "secondary-fixed-dim": { light: "#f6be3b" },
  "on-secondary-fixed": { light: "#261900" },
  "on-secondary-fixed-variant": { light: "#5c4300" },
  tertiary: { light: "#3b6849", dark: "#a2d2ac" },
  "on-tertiary": { light: "#ffffff", dark: "#00210e" },
  "tertiary-container": { light: "#9fcfa9" },
  "on-tertiary-container": { light: "#2d593c" },
  "tertiary-fixed": { light: "#bdeec7" },
  "tertiary-fixed-dim": { light: "#a2d2ac" },
  "on-tertiary-fixed": { light: "#00210e" },
  "on-tertiary-fixed-variant": { light: "#234f33" },
  "academy-background": { light: "#f9f9f9", dark: "#10150c" },
  "on-background": { light: "#1a1c1c", dark: "#dfe5d6" },
  surface: { light: "#f9f9f9", dark: "#10150c" },
  "on-surface": { light: "#1a1c1c", dark: "#dfe5d6" },
  "surface-variant": { light: "#e2e2e2", dark: "#31362c" },
  "on-surface-variant": { light: "#404a3a", dark: "#bfcab5" },
  "surface-dim": { light: "#dadada", dark: "#10150c" },
  "surface-bright": { light: "#f9f9f9", dark: "#353b31" },
  "surface-tint": { light: "#246d00", dark: "#81dc5a" },
  "surface-container-lowest": { light: "#ffffff", dark: "#0a1008" },
  "surface-container-low": { light: "#f3f3f4", dark: "#181d14" },
  "surface-container": { light: "#eeeeee", dark: "#1c2118" },
  "surface-container-high": { light: "#e8e8e8", dark: "#262c22" },
  "surface-container-highest": { light: "#e2e2e2", dark: "#31362c" },
  outline: { light: "#707a68", dark: "#8a9481" },
  "outline-variant": { light: "#bfcab5", dark: "#404a3a" },
  "inverse-surface": { light: "#2f3131", dark: "#dfe5d6" },
  "inverse-on-surface": { light: "#f0f1f1", dark: "#2c3228" },
  "inverse-primary": { light: "#81dc5a" },
  "academy-error": { light: "#ba1a1a", dark: "#ffb4ab" },
  "on-error": { light: "#ffffff", dark: "#690005" },
  "error-container": { light: "#ffdad6" },
  "on-error-container": { light: "#93000a" },
};

export function hexToTriplet(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

export function buildPzCss(): { root: Record<string, string>; dark: Record<string, string> } {
  const root: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const [name, t] of Object.entries(PZ_TOKENS)) {
    root[`--pz-${name}`] = hexToTriplet(t.light);
    if (t.dark) dark[`--pz-${name}`] = hexToTriplet(t.dark);
  }
  return { root, dark };
}

export function pzTailwindColors(): Record<string, string> {
  return Object.fromEntries(
    Object.keys(PZ_TOKENS).map((name) => [name, `rgb(var(--pz-${name}) / <alpha-value>)`]),
  );
}
