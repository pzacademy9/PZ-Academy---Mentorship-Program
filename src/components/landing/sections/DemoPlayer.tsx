// src/components/landing/sections/DemoPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { newClock, tick, type PauseSeconds, type WatchClock } from "@/lib/landing/demo-watch";
import { loadYouTubeApi, type YTPlayer } from "@/lib/landing/youtube-api";
import { RegisterButton, type Register } from "../RegisterButton";
import { onOpenRegistration } from "../registration/registration-bus";
import { YouTubeFacade } from "./YouTubeFacade";

const PLAYING = 1;
const STEP_MS = 500;

/**
 * A lecture video that pauses every few seconds of real watching and asks the visitor to register.
 * Nothing from YouTube loads until the thumbnail is clicked. If YouTube's script cannot load, the plain
 * video plays without popups (a dead box would be worse than a missing popup).
 */
export function DemoPlayer({ id, title, seconds, popupTitle, popupText, register }: {
  id: string; title: string; seconds: PauseSeconds; popupTitle: string; popupText: string; register: Register;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "plain">("idle");
  const [popup, setPopup] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const clock = useRef<WatchClock>(newClock(seconds));
  const apiRef = useRef<Awaited<ReturnType<typeof loadYouTubeApi>>>(null);

  useEffect(() => {
    if (phase !== "loading") return;
    let alive = true;
    void loadYouTubeApi().then((api) => {
      if (!alive) return;
      apiRef.current = api;
      setPhase(api ? "playing" : "plain");
    });
    return () => { alive = false; };
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing" || !host.current || !apiRef.current) return;
    const el = document.createElement("div");
    el.style.width = "100%";
    el.style.height = "100%";
    host.current.appendChild(el);
    clock.current = newClock(seconds);
    let timer: number | undefined;
    // The player has no methods until its frame is ready, so the watch clock starts only then.
    const startClock = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => {
        const p = player.current;
        if (!p || typeof p.getPlayerState !== "function") return;
        const r = tick(clock.current, STEP_MS / 1000, p.getPlayerState() === PLAYING);
        clock.current = r.clock;
        if (!r.pause) return;
        p.pauseVideo();
        if (document.fullscreenElement) void document.exitFullscreen?.();
        setPopup(true);
      }, STEP_MS);
    };
    const p = new apiRef.current.Player(el, {
      host: "https://www.youtube-nocookie.com", videoId: id, playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
      events: { onReady: startClock },
    });
    player.current = p;
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      p.destroy();
      player.current = null;
    };
  }, [phase, id, seconds]);

  // The registration form takes over: the popup steps aside and the video stays paused.
  useEffect(() => onOpenRegistration(() => {
    setPopup(false);
    const p = player.current;
    if (p && typeof p.pauseVideo === "function" && p.getPlayerState?.() === PLAYING) p.pauseVideo();
  }), []);

  // Move focus into the popup once, when it opens (not on every re-render).
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { if (popup) dialog.current?.focus(); }, [popup]);

  const keepWatching = () => {
    setPopup(false);
    clock.current = newClock(seconds);
    player.current?.playVideo();
  };

  if (phase === "idle") return <YouTubeFacade id={id} title={title} short={false} onPlay={() => setPhase("loading")} />;
  if (phase === "plain") return <YouTubeFacade id={id} title={title} short={false} autoStart />;

  return (
    <>
      <div className="aspect-video w-full overflow-hidden rounded-landing bg-landing-near-black shadow-landing-soft-lg [&_iframe]:h-full [&_iframe]:w-full">
        <div ref={host} className="h-full w-full" />
      </div>
      {popup ? (
        <div className="fixed inset-0 z-[45] flex items-center justify-center bg-landing-near-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={popupTitle}
            tabIndex={-1}
            ref={dialog}
            onKeyDown={(e) => { if (e.key === "Escape") keepWatching(); }}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-landing bg-landing-surface p-5 text-center shadow-landing-soft-lg outline-none md:p-8"
          >
            <h3 className="break-words font-headline text-xl font-bold text-landing-deep md:text-2xl">{popupTitle}</h3>
            {popupText ? <p className="mt-2 break-words text-sm text-landing-on-surface md:text-base">{popupText}</p> : null}
            <div className="mt-5 flex flex-col items-stretch gap-3">
              <RegisterButton register={register} size="lg" arrow className="w-full" menuPlacement="up" />
              <button type="button" onClick={keepWatching} className="rounded-landing border-2 border-landing-border px-6 py-3 font-headline text-sm font-bold text-landing-deep transition hover:bg-landing-primary/5">
                Keep watching
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
