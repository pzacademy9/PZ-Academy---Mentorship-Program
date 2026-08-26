import type { MentorTier } from "@/lib/mentor-tier";
import { resolvePublicMentorTierStyle } from "@/lib/mentor-tier-style";

/**
 * Public /mentorship surfaces only. Renders nothing for 'standard' — the
 * default floor is never branded as "lowest", per resolvePublicMentorTierStyle.
 * Never shows a number (score/count) — word only, subordinate to the
 * mentor's name it sits beside.
 */
export function MentorTierBadge({ tier, size = "sm" }: { tier: MentorTier; size?: "sm" | "md" }) {
  const style = resolvePublicMentorTierStyle(tier);
  if (!style) return null;

  return (
    <span
      className="font-poppins inline-flex items-center"
      style={{
        fontWeight: 700,
        fontSize: size === "md" ? "12px" : "11px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        background: style.brand.background,
        color: style.brand.color,
        border: `1px solid ${style.brand.border}`,
        borderRadius: "50px",
        padding: size === "md" ? "5px 14px" : "4px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </span>
  );
}
