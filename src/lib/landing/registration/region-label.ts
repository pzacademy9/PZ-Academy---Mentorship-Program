// src/lib/landing/registration/region-label.ts
// Pure. The name a visitor sees for a country on a public page.

/**
 * The International region (everyone not listed, paying the international way) is shown to visitors as "Other", so a
 * visitor from anywhere else knows it is for them. Only the stock name is replaced: a name the admin chose
 * (for example "Rest of world") is kept, and only the INTL key is ever renamed.
 */
export function publicRegionLabel(r: { key: string; label: string }): string {
  if (r.key !== "INTL") return r.label;
  const l = r.label.trim().toLowerCase();
  return l === "" || l === "international" ? "Other" : r.label;
}
