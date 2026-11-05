// Limits of the public course page parts. One table feeds the course editor,
// the save checker, the course file reader and the AI prompts, so they cannot drift.
export const PAGE_LIMITS = {
  /** "What you'll learn" and "This course includes": lines per list. */
  maxLines: 20,
  /** Letters in one of those lines. */
  maxLine: 200,
  maxFaqs: 30,
  maxQuestion: 300,
  maxAnswer: 2000,
  /** Highest course price in PKR a file may set. */
  maxPricePkr: 10_000_000,
} as const;
