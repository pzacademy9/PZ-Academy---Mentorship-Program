"use client";

import { useEffect, useRef, useState } from "react";
import { LibraryBig, type LucideIcon } from "lucide-react";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { compressImage } from "@/lib/landing/compress-image";
import { fileIdFromUrl, type MediaFolder } from "@/lib/landing/media";
import { MediaPicker } from "./MediaPicker";
import { readImageSize, registerUpload } from "./media-client";

/**
 * ImageUploadField is shared with other screens and uploads whatever file is picked, as-is, so it
 * is not changed. This wrapper catches the file input's change event on the way in (capture phase),
 * shrinks the picture (see compressImage), swaps the smaller file into the input and lets the
 * change event carry on to the shared field. If anything about that is unsupported the original
 * file simply goes through untouched.
 *
 * It also adds a "Choose from library" pop-up, and records freshly uploaded pictures in the
 * library. Only a real upload is recorded: a hand-typed link never is.
 */
export function LibraryImageField({
  value, onChange, labelledBy, describedBy, path, want, courseSlug, kind, folder = "misc", shape, icon, inputClassName, uploadLabel,
}: {
  value: string; onChange: (url: string) => void; labelledBy?: string; describedBy?: string; path?: string;
  want?: "wide" | "tall";
  courseSlug: string; kind: string; folder?: MediaFolder; shape?: "circle" | "square"; icon?: LucideIcon;
  inputClassName: string; uploadLabel?: string;
}) {
  const passThrough = useRef(false);
  // An upload finishes seconds after it started and calls onChange from the render it began in; always
  // go through the latest handler so edits made meanwhile are not reverted.
  const latest = useRef(onChange);
  latest.current = onChange;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [notSaved, setNotSaved] = useState(false);
  // Details of the file being uploaded, kept until the shared field reports the new link.
  const pending = useRef<{ name: string; sizeBytes: number; width: number | null; height: number | null } | null>(null);

  useEffect(() => {
    const meta = pending.current;
    if (value === "") { pending.current = null; setNotSaved(false); return; }
    if (!meta || !fileIdFromUrl(value)) return;
    pending.current = null;
    void registerUpload({ url: value, ...meta, folder }).then((ok) => setNotSaved(!ok));
  }, [value, folder]);

  function onChangeCapture(e: React.ChangeEvent<HTMLDivElement>) {
    const input = e.target as unknown as HTMLInputElement;
    // Events from the picker pop-up bubble through its portal; they are not ours.
    if (!e.currentTarget.contains(input)) return;
    if (input.type !== "file") { pending.current = null; setNotSaved(false); return; }
    if (passThrough.current) {
      passThrough.current = false;
      return;
    }
    const file = input.files?.[0];
    if (!file) return;
    e.stopPropagation();
    setNotSaved(false);
    void (async () => {
      let sent = file;
      try {
        const small = await compressImage(file);
        if (small !== file && typeof DataTransfer !== "undefined") {
          const dt = new DataTransfer();
          dt.items.add(small);
          input.files = dt.files;
          sent = small;
        }
      } catch {
        /* keep the original file */
      }
      const size = await readImageSize(sent);
      pending.current = {
        name: file.name.replace(/\.[^.]+$/, "") || "Picture",
        sizeBytes: sent.size,
        width: size?.width ?? null,
        height: size?.height ?? null,
      };
      passThrough.current = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })();
  }

  return (
    // role="group" + aria-labelledby gives the upload controls the field's visible name ("Picture").
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} data-field-path={path} onChangeCapture={onChangeCapture}>
      <ImageUploadField
        value={value}
        onChange={(url) => latest.current(url)}
        courseSlug={courseSlug}
        kind={kind}
        inputClassName={inputClassName}
        shape={shape}
        icon={icon}
        uploadLabel={uploadLabel}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-2.5 font-body text-xs font-bold text-pz-on-surface-variant transition-colors hover:bg-pz-surface-container-low focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
        >
          <LibraryBig className="h-3.5 w-3.5" />
          Choose from library
        </button>
        {notSaved && (
          <p role="status" className="font-body text-xs text-pz-on-surface-variant">Added to the page, but not saved to the library.</p>
        )}
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(url) => { pending.current = null; setNotSaved(false); latest.current(url); }} want={want} />
    </div>
  );
}
