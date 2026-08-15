export const MAX_NAME_LEN = 120;
export const MAX_EMAIL_LEN = 200;
export const MAX_COMMENTS_LEN = 2000;
export const MAX_QUESTION_LEN = 300;

/** Trim, strip control chars (keep tab/newline/CR), and cap length. */
export function cleanText(s: string, maxLen: number = MAX_COMMENTS_LEN): string {
  let out = String(s ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}

export function isValidEmail(s: string): boolean {
  const v = String(s ?? "").trim();
  if (!v || v.length > MAX_EMAIL_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Coerce to an integer star 1..5, or null if out of range/non-numeric. */
export function clampStar(n: unknown): number | null {
  const v = Number(n);
  if (!isFinite(v)) return null;
  const rounded = Math.round(v);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(String(s ?? "").trim());
}

const MAX_ANSWER_URL_LEN = 500;

/** Stars become a 1..5 number; video answers stay a capped http(s) URL; anything else is "". */
export function sanitizeAnswer(a: unknown): number | string {
  const s = String(a ?? "").trim();
  if (isHttpUrl(s)) return s.slice(0, MAX_ANSWER_URL_LEN);
  const star = clampStar(s);
  return star ?? "";
}

export function slugify(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function uniqueSlug(
  base: string,
  taken: { id: string; slug: string }[],
  exceptId: string | null,
): string {
  const root = slugify(base) || "session";
  const used = new Set(
    taken.filter((t) => t.id !== exceptId).map((t) => t.slug.trim().toLowerCase()).filter(Boolean),
  );
  if (!used.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
