import { Star } from "lucide-react";

/**
 * Shared star-rating display, promoted out of two byte-identical local
 * `StarRow` implementations (dashboard/mentor/feedback/[id]/page.tsx and
 * admin/feedback/[id]/SessionDetailClient.tsx). Server-safe (no client-only
 * hooks) so it works from both the server component and the client one.
 *
 * Not related to the satori `StarPath` implementations in
 * opengraph-image.tsx / api/share-card/[token]/route.tsx — those exist
 * because satori can't render lucide-react icons and must stay separate.
 */
export function StarRating({ value, size = 14, max = 5 }: { value: number; size?: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < Math.round(value) ? "fill-pz-secondary text-pz-secondary" : "text-pz-outline-variant"}
        />
      ))}
    </span>
  );
}
