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
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  // Encoded slash, backslash or dot-dot tricks.
  if (/%2f|%5c|%2e%2e/i.test(path)) return false;
  return true;
}

export function pickResumeTarget(saved: string | null | undefined): string {
  if (typeof saved === "string" && isRememberablePath(saved)) return saved;
  return RESUME_HOME;
}
