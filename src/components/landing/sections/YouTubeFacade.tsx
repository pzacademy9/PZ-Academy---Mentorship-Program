// src/components/landing/sections/YouTubeFacade.tsx
"use client";

import { useState } from "react";

/**
 * A thumbnail button that becomes the real (privacy-enhanced) YouTube player only after a click,
 * so a landing page never loads YouTube's scripts or sets its cookies until the visitor asks for it.
 * `id` is validated upstream by youtubeId() (11 chars of [A-Za-z0-9_-]).
 */
export function YouTubeFacade({ id, title, short }: { id: string; title: string; short: boolean }) {
  const [playing, setPlaying] = useState(false);
  const aspect = short ? "aspect-[9/16]" : "aspect-video";

  if (playing) {
    return (
      <div className={`${aspect} w-full overflow-hidden rounded-landing bg-landing-near-black shadow-landing-soft-lg`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className={`group relative ${aspect} w-full overflow-hidden rounded-landing border-2 border-landing-border bg-landing-deep shadow-landing-soft-lg transition hover:border-landing-primary`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party thumbnail; fixed dimensions reserve the space */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        width={480}
        height={360}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover opacity-85 transition-transform duration-500 group-hover:scale-105"
      />
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-landing-deep/80 via-transparent to-landing-near-black/30" />
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-landing-mint text-landing-deep shadow-landing-soft-lg transition-transform group-hover:scale-110">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-7 w-7 fill-current"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    </button>
  );
}
