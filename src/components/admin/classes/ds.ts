// PZ Academy design-system class strings for the Classes page (plain strings, safe to import anywhere).
// Light mode uses the design-system hex values; every one has a dark: counterpart that keeps the existing dark look.

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#196432] focus-visible:ring-offset-2 dark:focus-visible:ring-pz-primary dark:focus-visible:ring-offset-pz-surface";

/** Page body text: Poppins, ink on light. */
export const dsText = "font-poppins text-[#1A2E1F] dark:text-pz-on-surface";
export const dsMuted = "text-[#4D6B54] dark:text-pz-on-surface-variant";
/** Headings: Montserrat ExtraBold, tight tracking. */
export const dsHeading = "font-montserrat font-extrabold tracking-tight text-[#0F3D22] dark:text-pz-on-surface";
/** Small playful labels and badges. */
export const dsBadge =
  "inline-flex items-center rounded-full px-3 py-0.5 font-fredoka text-[15px] font-medium";
export const dsBadgeNeutral = `${dsBadge} bg-[#EAF5E4] text-[#0F3D22] dark:bg-pz-surface-container-high dark:text-pz-on-surface-variant`;

/** Card: 24px corners, 1px border, soft green shadow. One level only. */
export const dsCard =
  "rounded-3xl border border-[#D4EACC] bg-white p-4 shadow-[0_8px_30px_-12px_rgba(25,75,50,0.14)] dark:border-pz-outline-variant/60 dark:bg-pz-surface-container-lowest dark:shadow-none md:p-6 font-poppins text-[#1A2E1F] dark:text-pz-on-surface";
/** Hairline divider replacing a nested card. */
export const dsDivider = "border-t border-[#D4EACC] dark:border-pz-outline-variant/60";
/** Soft tinted panel for values (no border). */
export const dsWell = "rounded-2xl bg-[#F7FAF5] dark:bg-pz-surface-container-low";

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 min-h-12 font-poppins text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
/** Main call to action: lime with deep-green text. Only one per area. */
export const dsLime = `${BTN} ${FOCUS} bg-[#7ED957] text-[#0F3D22] hover:bg-[#6FCB4A] dark:bg-pz-primary dark:text-pz-on-primary dark:hover:bg-pz-on-primary-container`;
/** Second button: forest green solid. */
export const dsForest = `${BTN} ${FOCUS} bg-[#194B32] text-white hover:bg-[#0F3D22] dark:bg-pz-surface-container-high dark:text-pz-on-surface dark:hover:bg-pz-surface-container-highest`;
/** Second button: forest outline. */
export const dsOutline = `${BTN} ${FOCUS} border-2 border-[#194B32] bg-white text-[#194B32] hover:bg-[#F7FAF5] dark:border-pz-primary dark:bg-pz-surface-container-lowest dark:text-pz-primary dark:hover:bg-pz-surface-container-low`;
/** Small quiet pill (edit, secondary row actions). */
export const dsQuiet = `${BTN} ${FOCUS} border border-[#D4EACC] bg-white text-[#194B32] hover:bg-[#F7FAF5] dark:border-pz-outline-variant dark:bg-pz-surface-container-low dark:text-pz-on-surface-variant dark:hover:bg-pz-surface-container-high`;
/** Link-style text action. */
export const dsLink = `${FOCUS} rounded-full text-[#196432] dark:text-pz-primary`;
export const dsFocus = FOCUS;
export const dsField =
  "w-full rounded-2xl border border-[#D4EACC] bg-white px-4 py-2 min-h-12 font-poppins text-base text-[#1A2E1F] focus:outline-none focus:ring-2 focus:ring-[#196432] focus:ring-offset-2 dark:border-pz-outline-variant dark:bg-pz-surface-container-lowest dark:text-pz-on-surface dark:focus:ring-pz-primary/40 dark:focus:ring-offset-pz-surface";
export const dsLabel = "block font-poppins text-base font-semibold text-[#4D6B54] dark:text-pz-on-surface-variant mb-1";
/** Segmented control (pill track + pills). */
export const dsSegTrack = "rounded-full bg-[#EAF5E4] p-1 dark:bg-pz-surface-container-low";
export const dsSegOn = "bg-[#194B32] text-white dark:bg-pz-primary dark:text-pz-on-primary";
export const dsSegOff = "text-[#4D6B54] hover:text-[#0F3D22] dark:text-pz-on-surface-variant dark:hover:text-pz-on-surface";
/** Ticked state / selected-row accents. */
export const dsSelected = "border-[#194B32] bg-[#EAF5E4] dark:border-pz-primary dark:bg-pz-primary/10";
export const dsIdle = "border-[#D4EACC] bg-white hover:bg-[#F7FAF5] dark:border-pz-outline-variant/60 dark:bg-pz-surface-container-lowest dark:hover:bg-pz-surface-container-low";
