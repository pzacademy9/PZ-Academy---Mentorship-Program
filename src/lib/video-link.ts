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
  if (host === "drive.google.com" || host === "docs.google.com" || host.endsWith(".drive.google.com")) {
    return {
      status: "unsupported",
      message: "Google Drive videos cannot be played here. Use a YouTube or Vimeo link.",
    };
  }
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    return { status: "ok", provider: "youtube" };
  }
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    return { status: "ok", provider: "vimeo" };
  }
  return { status: "unsupported", message: "Only YouTube and Vimeo links can be played here." };
}
