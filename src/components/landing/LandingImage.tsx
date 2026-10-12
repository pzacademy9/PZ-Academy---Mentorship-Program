// src/components/landing/LandingImage.tsx
import { coverProxyUrl } from "@/lib/feedback/cover-url";

export function LandingImage({
  src, alt, width, height, priority = false, className,
}: { src: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Drive images go through /api/cover; explicit width/height prevent layout shift
    <img
      src={coverProxyUrl(src)}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={className}
    />
  );
}
