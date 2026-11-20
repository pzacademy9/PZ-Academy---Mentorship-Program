/** Normalise a YouTube/Vimeo URL to an embeddable form. */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return url;
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/shorts/")) {
        return `https://www.youtube.com/embed${u.pathname.replace("/shorts/", "/")}`;
      }
      // Handles youtube.com/live/<id> URLs (no ?v= param).
      if (u.pathname.startsWith("/live/")) {
        return `https://www.youtube.com/embed${u.pathname.replace("/live/", "/")}`;
      }
    }
    if (u.hostname.includes("vimeo.com") && !u.pathname.startsWith("/video/")) {
      return `https://player.vimeo.com/video${u.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

/** Picture for a YouTube link (watch, youtu.be, shorts, embed, live). Null for Vimeo or anything else. */
export function videoThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return null;
    const embed = new URL(toEmbedUrl(url));
    const m = embed.pathname.match(/^\/embed\/([\w-]+)\/?$/);
    return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}
