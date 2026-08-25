import type { Database } from "@/lib/supabase/database.types";

export type MentorTier = Database["public"]["Enums"]["mentor_tier"];

/**
 * Ladder order, low to high. Must match the enum DECLARATION order in
 * migration 0045 — Postgres sorts enums by declaration order and
 * `order by tier desc` on the public grid depends on it.
 */
export const MENTOR_TIERS = ["standard", "premium", "platinum", "elite"] as const satisfies readonly MentorTier[];

export interface MentorTierInputs {
  ratingAvg: number | null;
  reviewCount: number;
  sessionCount: number;
}

export interface MentorTierResult {
  tier: MentorTier;
  score: number;
  dampedRating: number;
}

/** Bayesian prior. Mentors are hand-vetted before publication, so "unknown" is "good, unproven". */
const PRIOR_RATING = 4.0;
/** A mentor's own average carries equal weight to the prior at exactly 5 reviews. */
const PRIOR_WEIGHT = 5;
/** Rescale 3.0-5.0 -> 0-1; on a raw 0-5 scale every real mentor sits in an unreadable 4.0-4.9 band. */
const RATING_FLOOR = 3.0;
/** Completed sessions at which the experience term saturates (~1/week hits it in under a year). */
const SESSION_SATURATION = 40;
/** Quality ladder with a volume guard, not a leaderboard. Weights sum to 1. */
const QUALITY_WEIGHT = 0.75;
const EXPERIENCE_WEIGHT = 0.25;

const TIER_THRESHOLDS: readonly { tier: MentorTier; min: number }[] = [
  { tier: "elite", min: 88 },
  { tier: "platinum", min: 76 },
  { tier: "premium", min: 62 },
  { tier: "standard", min: 0 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pure. No I/O, no Date, no randomness — same inputs always give the same
 * tier. The migration deliberately does not duplicate this in SQL.
 */
export function computeMentorTier(inputs: MentorTierInputs): MentorTierResult {
  const reviewCount = Math.max(0, Math.floor(inputs.reviewCount || 0));
  const sessionCount = Math.max(0, Math.floor(inputs.sessionCount || 0));
  const ratingAvg = reviewCount > 0 && inputs.ratingAvg != null ? clamp(inputs.ratingAvg, 1, 5) : null;
  const effectiveCount = ratingAvg == null ? 0 : reviewCount;

  const dampedRating = (PRIOR_WEIGHT * PRIOR_RATING + (ratingAvg ?? 0) * effectiveCount) / (PRIOR_WEIGHT + effectiveCount);

  const qualityNorm = clamp((dampedRating - RATING_FLOOR) / (5 - RATING_FLOOR), 0, 1);
  const experienceNorm = clamp(Math.log1p(sessionCount) / Math.log1p(SESSION_SATURATION), 0, 1);

  const raw = qualityNorm * QUALITY_WEIGHT + experienceNorm * EXPERIENCE_WEIGHT;
  const score = Math.round(raw * 1000) / 10;

  const tier = TIER_THRESHOLDS.find((t) => score >= t.min)!.tier;
  return { tier, score, dampedRating: Math.round(dampedRating * 100) / 100 };
}

export const FEATURED_TIERS = ["platinum", "elite"] as const satisfies readonly MentorTier[];

export function isFeaturedTier(tier: MentorTier): boolean {
  return (FEATURED_TIERS as readonly MentorTier[]).includes(tier);
}

export function partitionByFeaturedTier<T extends { tier: MentorTier }>(mentors: T[]): { featured: T[]; rest: T[] } {
  return {
    featured: mentors.filter((m) => isFeaturedTier(m.tier)),
    rest: mentors.filter((m) => !isFeaturedTier(m.tier)),
  };
}

/** A strip with zero mentors is an empty band; one with every mentor leaves the grid empty. Both collapse to "no strip". */
export function shouldRenderFeaturedStrip(featuredCount: number, totalCount: number): boolean {
  return featuredCount > 0 && featuredCount < totalCount;
}

export const MENTOR_TIER_LABELS: Record<MentorTier, string> = {
  standard: "Standard",
  premium: "Premium",
  platinum: "Platinum",
  elite: "Elite",
};

/**
 * Suggested single-session PKR range per tier. ADVISORY ONLY — never a cap,
 * never blocks a save. Bands overlap on purpose so a mentor near a boundary
 * doesn't get warned the moment they're promoted. Calibrated against the
 * seeded registry (0028 ships prices of 3000 and 6000, both inside `standard`).
 */
export const TIER_PRICE_GUIDANCE: Record<MentorTier, { min: number; max: number }> = {
  standard: { min: 2000, max: 6000 },
  premium: { min: 4000, max: 10000 },
  platinum: { min: 8000, max: 18000 },
  elite: { min: 15000, max: 40000 },
};

/** Non-blocking, same contract as mentorPackageWarnings: [] when fine, else joined into payload.warning -> toast.warning. */
export function mentorTierPriceWarnings(tier: MentorTier, pricePerSessionPkr: number): string[] {
  const band = TIER_PRICE_GUIDANCE[tier];
  const range = `PKR ${band.min.toLocaleString()}–${band.max.toLocaleString()}`;
  const price = `PKR ${pricePerSessionPkr.toLocaleString()}`;
  if (pricePerSessionPkr < band.min) {
    return [`${price} is below the suggested ${MENTOR_TIER_LABELS[tier]} range (${range}). This is guidance only — the price was saved as entered.`];
  }
  if (pricePerSessionPkr > band.max) {
    return [`${price} is above the suggested ${MENTOR_TIER_LABELS[tier]} range (${range}). This is guidance only — the price was saved as entered.`];
  }
  return [];
}
