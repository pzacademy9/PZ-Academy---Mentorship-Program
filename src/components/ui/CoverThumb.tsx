"use client";

import { useState } from "react";
import { isAllowedCoverUrl } from "@/lib/classes/cover";
import { coverProxyUrl } from "@/lib/feedback/cover-url";

export function CoverThumb({
  url,
  title,
  className = "",
}: {
  url: string | null | undefined;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = isAllowedCoverUrl(url) && !failed;
  const letter = (title.trim().charAt(0) || "?").toUpperCase();

  return (
    <div className={`aspect-[16/9] overflow-hidden rounded-t-xl ${className}`.trim()}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through our own /api/cover proxy
        <img
          src={coverProxyUrl(url)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-pz-surface-container-high">
          <span aria-hidden="true" className="text-3xl font-semibold text-pz-mid">
            {letter}
          </span>
        </div>
      )}
    </div>
  );
}
