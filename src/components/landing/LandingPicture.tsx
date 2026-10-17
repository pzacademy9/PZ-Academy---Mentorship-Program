// src/components/landing/LandingPicture.tsx
import { coverProxyUrl } from "@/lib/feedback/cover-url";

/**
 * One <picture>: the phone image is the <img>, the PC image is a <source> from 768px up, so a visitor
 * downloads only one. The wrapper box has a fixed aspect ratio (9:16 on phones, 16:9 from md) so the
 * page never shifts while it loads. Either image may be missing; the other one is used for both.
 */
export function LandingPicture({
  pc, phone, alt, fit, priority = false, className = "",
}: { pc: string; phone: string; alt: string; fit: "cover" | "contain"; priority?: boolean; className?: string }) {
  const pcSrc = coverProxyUrl(pc || phone);
  const phoneSrc = coverProxyUrl(phone || pc);
  if (!phoneSrc) return null;
  return (
    <div className={`relative aspect-[9/16] w-full overflow-hidden md:aspect-[16/9] ${className}`.trim()}>
      <picture>
        {pcSrc !== phoneSrc ? <source media="(min-width: 768px)" srcSet={pcSrc} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- Drive images go through /api/cover; the box above reserves the space */}
        <img
          src={phoneSrc}
          alt={alt}
          width={900}
          height={1600}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          {...(priority ? { fetchPriority: "high" as const } : {})}
          className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      </picture>
    </div>
  );
}
