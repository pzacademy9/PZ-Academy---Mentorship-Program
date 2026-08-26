import type { MentorTier } from "@/lib/mentor-tier";
import { MENTOR_TIER_LABELS } from "@/lib/mentor-tier";

export interface MentorTierStyle {
  label: string;
  /** Admin / dashboard surfaces — pz-* Material tokens (see EnrollmentStatusBadge). */
  className: string;
  /** Public /mentorship surfaces — inline hex from the separate `brand` palette
   *  (tailwind.config.ts: "Mentorship section only — do not use elsewhere").
   *  Those pages style almost entirely with inline style objects, so this is a
   *  style object, not a class string, on purpose. */
  brand: { background: string; color: string; border: string };
}

/**
 * Keyed by the FULL enum: adding a 5th mentor_tier fails the build here
 * instead of rendering a blank pill (the EnrollmentStatusBadge rule).
 * One record with two fields, not two records — a new tier can't be added
 * to one palette and forgotten in the other.
 *
 * Colors sourced from the Stitch "Mentor Tier Comparison" and "Tier & Ranking
 * Admin Edit Page" screens (Stitch project 4651274386787527431), ported the
 * same way docs/stitch-prompts-feedback-phase-2.md describes: Stitch's
 * Material-3 "fixed" tokens resolved to concrete hex for the admin pz-*
 * variant, and the raw brand hex kept as-is for the public variant.
 */
const TIER_STYLES: Record<MentorTier, MentorTierStyle> = {
  standard: {
    label: MENTOR_TIER_LABELS.standard,
    className: "bg-pz-surface-container-high text-pz-on-surface-variant",
    brand: { background: "#F1F1EE", color: "#6B7280", border: "#E5E1D8" },
  },
  premium: {
    label: MENTOR_TIER_LABELS.premium,
    className: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant",
    brand: { background: "#D9E5DF", color: "#3D4944", border: "#BDC9C3" },
  },
  platinum: {
    label: MENTOR_TIER_LABELS.platinum,
    className: "bg-pz-surface-variant text-pz-on-surface",
    brand: { background: "#E3E2DF", color: "#1B1C1A", border: "#C1C9BF" },
  },
  elite: {
    label: MENTOR_TIER_LABELS.elite,
    className: "bg-pz-gold/15 text-pz-gold font-bold",
    brand: { background: "#C9A84C", color: "#1A4D2E", border: "#B08F35" },
  },
};

/** Admin surfaces: always a pill, including 'standard' — an admin needs to distinguish "standard" from "data missing". */
export function mentorTierStyle(tier: MentorTier): MentorTierStyle {
  return TIER_STYLES[tier];
}

/**
 * PUBLIC surfaces: null for 'standard'. Single enforcement point for "the
 * default floor renders no badge, so a new mentor is never branded as
 * lowest" — every public call site is `if (!style) return null`.
 */
export function resolvePublicMentorTierStyle(tier: MentorTier): MentorTierStyle | null {
  return tier === "standard" ? null : TIER_STYLES[tier];
}
