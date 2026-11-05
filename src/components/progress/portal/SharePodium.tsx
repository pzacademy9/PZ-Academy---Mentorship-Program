"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Image as ImageIcon, Share, Smartphone } from "lucide-react";
import { podiumFileName, podiumImageUrl, type PodiumSize } from "@/lib/progress/leaderboard";
import { fetchPodiumBlob, saveBlobViaLink, sharePodiumBlob } from "@/lib/progress/share-podium";
import { btnFocus } from "../ui";

const CHOICES: { size: PodiumSize; title: string; hint: string; Icon: typeof ImageIcon }[] = [
  { size: "square", title: "Square picture", hint: "1080 x 1080, for posts", Icon: ImageIcon },
  { size: "story", title: "Story picture", hint: "1080 x 1920, for status and stories", Icon: Smartphone },
];

type Picture = { status: "loading" } | { status: "ready"; blob: Blob } | { status: "error" };

/**
 * "Share podium" button with a small menu: square or story picture of the board on screen.
 * Both pictures are fetched when the menu opens, so a tap can share (or save) at once.
 */
export function SharePodium({ slug, title, pick, label }: { slug: string; title: string; pick: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [pictures, setPictures] = useState<Record<string, Picture>>({});
  const [busy, setBusy] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const prepare = () => {
    for (const { size } of CHOICES) {
      const url = podiumImageUrl(slug, size, pick);
      const known = pictures[url];
      if (known && known.status !== "error") continue;
      setPictures((p) => ({ ...p, [url]: { status: "loading" } }));
      void fetchPodiumBlob(url, (u) => fetch(u)).then((blob) =>
        setPictures((p) => ({ ...p, [url]: blob ? { status: "ready", blob } : { status: "error" } })),
      );
    }
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
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
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) return close(false);
          prepare();
          setOpen(true);
        }}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-headline text-sm font-bold text-pz-tertiary-fixed ring-1 ring-white/20 transition-colors hover:bg-white/20 motion-reduce:transition-none ${btnFocus}`}
      >
        <Share aria-hidden className="h-4 w-4" />
        Share podium
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="group"
          aria-label="Share podium picture"
          tabIndex={-1}
          className="absolute right-0 top-full z-20 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xl bg-pz-surface-container-lowest p-2 shadow-lg outline-none ring-1 ring-pz-outline-variant/60"
        >
          <p className="px-2 pb-1 pt-1 text-xs text-pz-on-surface-variant">Top three, {label}</p>
          {CHOICES.map(({ size, title: choice, hint, Icon }) => {
            const url = podiumImageUrl(slug, size, pick);
            const pic = pictures[url];
            const ready = pic?.status === "ready" ? pic.blob : null;
            return (
              <button
                key={size}
                type="button"
                disabled={!ready || busy}
                onClick={() => {
                  if (!ready || busy) return;
                  setBusy(true);
                  // Straight from the tap: no await before the share sheet opens.
                  const done = sharePodiumBlob(ready, podiumFileName(slug, label, size), title, {
                    navigator: typeof navigator === "undefined" ? undefined : navigator,
                    save: saveBlobViaLink,
                  });
                  close(true);
                  void done.finally(() => setBusy(false));
                }}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-left enabled:hover:bg-pz-surface-container-high disabled:cursor-not-allowed ${btnFocus}`}
              >
                <Icon aria-hidden className={`h-5 w-5 shrink-0 ${ready ? "text-pz-primary" : "text-pz-outline"}`} />
                <span className="flex min-w-0 flex-col">
                  <span className={`font-headline text-sm font-bold ${ready ? "text-pz-on-surface" : "text-pz-on-surface-variant"}`}>{choice}</span>
                  {pic?.status === "error" ? (
                    <span role="alert" className="text-xs text-pz-academy-error">
                      Could not make this picture. Please try again later.
                    </span>
                  ) : pic?.status === "ready" ? (
                    <span className="text-xs text-pz-on-surface-variant">{hint}</span>
                  ) : (
                    <span className="text-xs text-pz-on-surface-variant">Preparing…</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
