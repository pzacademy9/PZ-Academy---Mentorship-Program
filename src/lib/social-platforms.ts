/**
 * Pure hostname -> platform detection for mentor social links, split out of
 * BrandIcons.tsx so it stays importable from vitest — this repo's vitest
 * setup has no JSX/React transform configured (every existing test imports
 * plain .ts logic only; BrandIcons.tsx's actual <svg> JSX fails to parse
 * under vitest's esbuild transform, "jsx: preserve" is Next's SWC setting).
 */
export const SOCIAL_PLATFORMS = ["linkedin", "x", "instagram", "youtube", "facebook", "github"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  github: "GitHub",
};

const PLATFORM_HOSTS: { hosts: string[]; platform: SocialPlatform }[] = [
  { hosts: ["linkedin.com"], platform: "linkedin" },
  { hosts: ["twitter.com", "x.com"], platform: "x" },
  { hosts: ["instagram.com"], platform: "instagram" },
  { hosts: ["youtube.com", "youtu.be"], platform: "youtube" },
  { hosts: ["facebook.com", "fb.com"], platform: "facebook" },
  { hosts: ["github.com"], platform: "github" },
];

/**
 * Identifies the platform behind a social link URL from its hostname alone —
 * the SocialLinkRepeater in the admin form only collects {label, url}, so
 * this is the only signal available to pick a matching brand icon. Returns
 * null for anything unrecognized (personal sites, WhatsApp, etc.); callers
 * fall back to a generic icon and the admin-entered label in that case.
 */
export function detectSocialPlatform(url: string): SocialPlatform | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  const match = PLATFORM_HOSTS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return match ? match.platform : null;
}
