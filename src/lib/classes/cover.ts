// Edge-safe (no server-only): also used by the share-card and review image routes.
// A cover URL is only trusted when it points at a host the picture library produces.

const GOOGLE_IMAGE_HOST = /^lh\d\.googleusercontent\.com$/i;

function supabaseHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return raw ? new URL(raw).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** True for an https URL on Google Drive, Google image hosting, or this project's Supabase storage. */
export function isAllowedCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return host === "drive.google.com" || GOOGLE_IMAGE_HOST.test(host) || host === supabaseHost();
}
