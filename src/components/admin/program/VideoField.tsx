"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { checkVideoLink } from "@/lib/video-link";
import { toEmbedUrl, videoThumbnail } from "@/lib/video-embed";

/**
 * One video link input. Saves on blur (an empty value clears the video) and
 * shows a plain-words check of the link. The check never blocks saving, so
 * links saved before the check existed stay editable.
 */
export function VideoField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (url: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const id = useId();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const check = checkVideoLink(draft);
  const link = draft.trim();
  const [playing, setPlaying] = useState(false);

  // A new link starts again from the picture.
  useEffect(() => {
    setPlaying(false);
  }, [link]);

  const thumb = check.status === "ok" ? videoThumbnail(link) : null;
  const embed =
    check.status === "ok"
      ? toEmbedUrl(link).replace("https://www.youtube.com/embed/", "https://www.youtube-nocookie.com/embed/")
      : null;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[10px] uppercase font-bold text-pz-on-surface-variant tracking-wider ml-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value.trim()) void onSave(draft.trim());
        }}
        placeholder="Paste a YouTube or Vimeo link"
        className="w-full bg-pz-surface border border-pz-outline-variant rounded-lg px-4 py-3 focus:ring-2 focus:ring-pz-primary focus:outline-none font-medium max-md:text-base max-md:min-h-11"
      />
      {check.status === "ok" && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-pz-primary ml-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {check.provider === "youtube" ? "YouTube video found" : "Vimeo video found"}
        </p>
      )}
      {embed && (
        <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-pz-outline-variant bg-pz-surface-container-low">
          {playing ? (
            <iframe
              src={embed}
              title="Video preview"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-pz-on-surface-variant">
                  Video found
                </span>
              )}
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-lg bg-pz-primary px-3 py-2 text-xs font-bold text-white max-md:min-h-11"
              >
                <Play className="w-3.5 h-3.5" />
                Play preview
              </button>
            </>
          )}
        </div>
      )}
      {(check.status === "unsupported" || check.status === "invalid") && (
        <p
          className={
            "flex items-start gap-1.5 text-xs font-bold ml-1 " +
            (check.status === "invalid" ? "text-pz-danger" : "text-pz-warning")
          }
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {check.message}
        </p>
      )}
    </div>
  );
}
