import type { MentorTier } from "@/lib/mentor-tier";
import { mentorTierStyle } from "@/lib/mentor-tier-style";
import { cn } from "@/lib/utils";

/**
 * Admin surfaces only — always renders, including 'standard' (an admin needs
 * to distinguish "standard" from "data missing"). Shape follows
 * EnrollmentStatusBadge's convention: keyed by the full enum so a new tier
 * fails the build here rather than rendering a blank pill.
 */
export function MentorTierPill({ tier, className }: { tier: MentorTier; className?: string }) {
  const style = mentorTierStyle(tier);
  return (
    <span
      className={cn(
        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
