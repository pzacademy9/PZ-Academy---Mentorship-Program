/**
 * Rewrites a Drive-hosted cover URL through /api/cover/{fileId} so a browser
 * <img> doesn't hit Drive's thumbnail endpoint directly (Drive's CORP header
 * blocks hotlinked thumbnails). Was duplicated verbatim in SessionDetailClient.tsx
 * and review/[token]/page.tsx — this is the single shared copy.
 */
export function coverProxyUrl(url: string): string {
  const m = url.match(/[?&]id=([A-Za-z0-9_-]+)/) ?? url.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? `/api/cover/${m[1]}` : url;
}
