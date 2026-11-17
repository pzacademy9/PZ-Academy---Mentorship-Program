// Pure helpers for the "reopen the last portal page" feature.
// Security-sensitive: only same-site paths under /dashboard may be returned.

export const RESUME_KEY = "pz:last-portal-path";
export const RESUME_HOME = "/dashboard";

const MAX_LENGTH = 500;

export function isRememberablePath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_LENGTH) {
    return false;
  }
  if (
    !(
      path === "/dashboard" ||
      path.startsWith("/dashboard/") ||
      path.startsWith("/dashboard?")
    )
  ) {
    return false;
  }
  if (path.includes("//") || path.includes("\\") || path.includes("..")) {
    return false;
  }
  // Control characters (C0 and DEL).
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return false;
  }
  // Encoded slash, backslash or dot: the URL parser treats ".%2e" as "..".
  if (/%2f|%5c|%2e/i.test(path)) return false;
  return true;
}

export function pickResumeTarget(saved: string | null | undefined): string {
  if (typeof saved === "string" && isRememberablePath(saved)) return saved;
  return RESUME_HOME;
}
