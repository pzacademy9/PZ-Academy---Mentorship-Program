// Pure helpers for the public /mentorship page: fields, search, the "from"
// price and the trust facts. Every number shown comes from real data.

type CatalogMentor = {
  name: string;
  title: string;
  expertise: string;
  domain: string;
  skills: string[];
  pricePerSession: number;
  packages: { sessions: number; price: number }[];
};

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** The field a mentor is listed under: the admin's "domain", else the expertise line. */
export function mentorField(m: Pick<CatalogMentor, "domain" | "expertise">): string {
  return tidy(m.domain) || tidy(m.expertise);
}

/** Distinct fields of the listed mentors, A to Z. A field with no mentor is never shown. */
export function mentorFields(mentors: Pick<CatalogMentor, "domain" | "expertise">[]): string[] {
  const seen = new Map<string, string>();
  for (const m of mentors) {
    const f = mentorField(m);
    if (f && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Field button + search box. */
export function filterMentors<T extends CatalogMentor>(mentors: T[], field: string | null, query: string): T[] {
  const q = tidy(query).toLowerCase();
  return mentors.filter((m) => {
    if (field && mentorField(m).toLowerCase() !== field.toLowerCase()) return false;
    if (!q) return true;
    return [m.name, m.title, m.expertise, m.domain, ...m.skills].some((s) => s.toLowerCase().includes(q));
  });
}

/** Lowest price of one session, counting packages per session. null when nothing is priced. */
export function priceFrom(m: Pick<CatalogMentor, "pricePerSession" | "packages">): number | null {
  const prices: number[] = [];
  if (m.pricePerSession > 0) prices.push(m.pricePerSession);
  for (const p of m.packages ?? []) {
    if (p.sessions > 0 && p.price > 0) prices.push(Math.round(p.price / p.sessions));
  }
  return prices.length > 0 ? Math.min(...prices) : null;
}

export type TrustFacts = { mentors: number; fields: number; reviews: number };

/** Counts for the trust cards, from the published mentors and their real public reviews. */
export function trustFacts(
  mentors: Pick<CatalogMentor, "domain" | "expertise">[],
  reviewCounts: number[],
): TrustFacts {
  return {
    mentors: mentors.length,
    fields: mentorFields(mentors).length,
    reviews: reviewCounts.reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0),
  };
}
