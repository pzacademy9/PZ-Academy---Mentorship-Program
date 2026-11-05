"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Image as ImageIcon, Share, Smartphone } from "lucide-react";
import { podiumFileName, podiumImageUrl, type PodiumSize } from "@/lib/progress/leaderboard";
import { canShareFiles, downloadViaLink, sharePodiumImage } from "@/lib/progress/share-podium";
import { btnFocus } from "../ui";

const CHOICES: { size: PodiumSize; title: string; hint: string; Icon: typeof ImageIcon }[] = [
  { size: "square", title: "Square picture", hint: "1080 x 1080, for posts", Icon: ImageIcon },
  { size: "story", title: "Story picture", hint: "1080 x 1920, for status and stories", Icon: Smartphone },
];

/** "Share podium" button with a small menu: square or story picture of the board on screen. */
export function SharePodium({ slug, title, pick, label }: { slug: string; title: string; pick: string; label: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-headline text-sm font-bold text-pz-tertiary-fixed ring-1 ring-white/20 transition-colors hover:bg-white/20 motion-reduce:transition-none ${btnFocus}`}
      >
        <Share aria-hidden className="h-4 w-4" />
        Share podium
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xl bg-pz-surface-container-lowest p-2 shadow-lg ring-1 ring-pz-outline-variant/60"
        >
          <p className="px-2 pb-1 pt-1 text-xs text-pz-on-surface-variant">Top three, {label}</p>
          {CHOICES.map(({ size, title: choice, hint, Icon }) => {
            const url = podiumImageUrl(slug, size, pick);
            const fileName = podiumFileName(slug, label, size);
            return (
              <a
                key={size}
                href={url}
                download={fileName}
                onClick={(e) => {
                  setOpen(false);
                  if (!canShareFiles(typeof navigator === "undefined" ? undefined : navigator)) return; // the link downloads by itself
                  e.preventDefault();
                  void sharePodiumImage(url, fileName, title, { fetch: (u) => fetch(u), navigator, download: downloadViaLink });
                }}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-pz-surface-container-high ${btnFocus}`}
              >
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-pz-primary" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-headline text-sm font-bold text-pz-on-surface">{choice}</span>
                  <span className="text-xs text-pz-on-surface-variant">{hint}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
