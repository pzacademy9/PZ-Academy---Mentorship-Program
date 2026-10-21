/** Pure (no server-only imports): also used by client components. */

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);
const ID = /^[A-Za-z0-9_-]+$/;

/** The Drive file id of an https drive/docs link (/file/d/<id>, /open?id=, /uc?id=), or null for anything else. */
export function driveFileId(url: string | null): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !DRIVE_HOSTS.has(u.hostname)) return null;
  const path = /^\/(?:[^/]+\/)?file\/d\/([^/]+)/.exec(u.pathname);
  if (path && ID.test(path[1])) return path[1];
  if (u.pathname === "/open" || u.pathname === "/uc") {
    const id = u.searchParams.get("id");
    if (id && ID.test(id)) return id;
  }
  return null;
}

/** Drive images need the /thumbnail?id= form (uc?export=view is blocked by CORP). */
export function voucherThumbSrc(url: string | null): string | null {
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w160` : null;
}
