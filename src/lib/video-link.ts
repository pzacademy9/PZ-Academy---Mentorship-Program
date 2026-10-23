export type VideoLinkCheck =
  | { status: "empty" }
  | { status: "ok"; provider: "youtube" | "vimeo" }
  | { status: "unsupported"; message: string }
  | { status: "invalid"; message: string };

const INVALID = "That doesn't look like a web link.";

/** Classify a pasted video link. Never throws. */
export function checkVideoLink(url: string): VideoLinkCheck {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return { status: "empty" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { status: "invalid", message: INVALID };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { status: "invalid", message: INVALID };
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "drive.google.com" ||
    host === "docs.google.com" ||
    host.endsWith(".drive.google.com") ||
    host === "drive.usercontent.google.com"
  ) {
    return {
      status: "unsupported",
      message: "Google Drive videos cannot be played here. Use a YouTube or Vimeo link.",
    };
  }
  const notSingle: VideoLinkCheck = { status: "invalid", message: "That link doesn't point to a single video." };
  const path = u.pathname;
  if (host === "youtu.be") {
    return /^\/[^/]+/.test(path) ? { status: "ok", provider: "youtube" } : notSingle;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const hasId = !!u.searchParams.get("v") || /^\/(embed|shorts|live)\/[^/]+/.test(path);
    return hasId ? { status: "ok", provider: "youtube" } : notSingle;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    return /^\/\d+\/?$/.test(path) ? { status: "ok", provider: "vimeo" } : notSingle;
  }
  if (host === "player.vimeo.com") {
    return /^\/video\/\d+/.test(path) ? { status: "ok", provider: "vimeo" } : notSingle;
  }
  return { status: "unsupported", message: "Only YouTube and Vimeo links can be played here." };
}
