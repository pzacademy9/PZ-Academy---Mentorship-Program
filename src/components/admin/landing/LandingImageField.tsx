"use client";

import { useRef } from "react";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { compressImage } from "@/lib/landing/compress-image";

const INPUT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-pz-on-surface shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * ImageUploadField is shared with other screens and uploads whatever file is picked, as-is, so it
 * is not changed. This wrapper catches the file input's change event on the way in (capture phase),
 * shrinks the picture (see compressImage), swaps the smaller file into the input and lets the
 * change event carry on to the shared field. If anything about that is unsupported the original
 * file simply goes through untouched.
 */
export function LandingImageField({
  value, onChange, labelledBy, describedBy, path,
}: { value: string; onChange: (url: string) => void; labelledBy?: string; describedBy?: string; path?: string }) {
  const passThrough = useRef(false);
  // An upload finishes seconds after it started and calls onChange from the render it began in; always
  // go through the latest handler so edits made meanwhile are not reverted.
  const latest = useRef(onChange);
  latest.current = onChange;

  function onChangeCapture(e: React.ChangeEvent<HTMLDivElement>) {
    const input = e.target as unknown as HTMLInputElement;
    if (input.type !== "file") return;
    if (passThrough.current) {
      passThrough.current = false;
      return;
    }
    const file = input.files?.[0];
    if (!file) return;
    e.stopPropagation();
    void (async () => {
      try {
        const small = await compressImage(file);
        if (small !== file && typeof DataTransfer !== "undefined") {
          const dt = new DataTransfer();
          dt.items.add(small);
          input.files = dt.files;
        }
      } catch {
        /* keep the original file */
      }
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
        courseSlug="landing-pages"
        kind="landing"
        inputClassName={INPUT}
        shape="square"
      />
    </div>
  );
}
