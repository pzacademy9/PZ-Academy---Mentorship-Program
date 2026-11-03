// src/lib/landing/youtube-api.ts
// Loads YouTube's player script on demand (only after a visitor asks to play), once per page.

export interface YTPlayer {
  getPlayerState(): number;
  pauseVideo(): void;
  playVideo(): void;
  destroy(): void;
}
export interface YTApi {
  Player: new (el: HTMLElement, opts: { host?: string; videoId: string; playerVars?: Record<string, unknown>; events?: { onReady?: () => void } }) => YTPlayer;
}

declare global {
  interface Window {
    YT?: Partial<YTApi>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<YTApi | null> | null = null;

/** Resolves with YouTube's API, or null when it is blocked, fails, or takes longer than 8 seconds. */
export function loadYouTubeApi(): Promise<YTApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT as YTApi);
  if (pending) return pending;
  pending = new Promise<YTApi | null>((resolve) => {
    const done = (v: YTApi | null) => { window.clearTimeout(timer); resolve(v); if (v === null) pending = null; };
    const timer = window.setTimeout(() => done(null), 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      done(window.YT?.Player ? (window.YT as YTApi) : null);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => done(null);
    document.head.appendChild(s);
  });
  return pending;
}
