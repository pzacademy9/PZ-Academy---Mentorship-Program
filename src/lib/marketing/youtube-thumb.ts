import { youtubeId } from "@/lib/landing/simple-text";

/** YouTube's own still picture for a video link, or null when the link is not a YouTube video. */
export function youtubeThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
