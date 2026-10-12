export const RESERVED_SLUGS = [
  "api", "new", "preview", "admin", "dashboard", "login", "register", "auth",
  "e", "courses", "workshops", "webinars", "enroll", "portal", "leads",
] as const;

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s;
}

export function validateSlug(slug: string): { ok: true } | { ok: false; message: string } {
  if (slug.length < 3) return { ok: false, message: "The link must be at least 3 characters." };
  if (slug.length > 60) return { ok: false, message: "The link must be 60 characters or fewer." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, message: "Use only lowercase letters, numbers and single dashes (for example ppc-batch-4)." };
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, message: "That link is reserved. Please choose a different one." };
  }
  return { ok: true };
}
