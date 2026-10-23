"use client";

import { LibraryImageField } from "./LibraryImageField";

const INPUT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-pz-on-surface shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** The landing page editor's picture field: the shared library field with the landing settings. */
export function LandingImageField({
  value, onChange, labelledBy, describedBy, path, want,
}: {
  value: string; onChange: (url: string) => void; labelledBy?: string; describedBy?: string; path?: string;
  want?: "wide" | "tall";
}) {
  return (
    <LibraryImageField
      value={value} onChange={onChange} labelledBy={labelledBy} describedBy={describedBy} path={path} want={want}
      courseSlug="landing-pages" kind="landing" shape="square" inputClassName={INPUT} uploadLabel="Upload new"
    />
  );
}
