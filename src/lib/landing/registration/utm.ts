// src/lib/landing/registration/utm.ts
/** The only attribution keys we store; anything else in a query string is dropped. */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of UTM_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim().slice(0, 200);
  }
  return out;
}
