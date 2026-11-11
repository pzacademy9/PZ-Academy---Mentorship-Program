// src/lib/data/affiliate-page.ts
// Everything an affiliate sees on their private page (/affiliate/<token>). The token is the only key: it is
// checked for shape before any query, and only an accepted affiliate has a page.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listPublishedLinkPages } from "@/lib/data/landing-agent-stats";
import {
  AUTO_STEP,
  balancePkr,
  commissionPercent,
  monthKey,
  paidInMonth,
  paidSoFar,
  previousMonthKey,
  splitCommissions,
  type CommissionRow,
} from "@/lib/affiliates/commission";
import { affiliateSupportWa } from "@/lib/affiliates/contact";
import { getAffiliateRank, getBoardToken, type OwnRank } from "@/lib/data/affiliate-leaderboard";

// Tokens are 24 random bytes in base64url (32 characters). Anything else never reaches the database.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type AffiliatePageLink = { pageId: string; title: string; url: string; views: number; registered: number; paid: number };

export type AffiliatePageModel = {
  name: string;
  code: string;
  team: string | null;
  percent: number;
  /** True when the percent follows the monthly rule; false when the owner set it by hand. */
  automatic: boolean;
  /** All-time paid participants (imported plus new). */
  paidCount: number;
  /** Paid participants so far this calendar month (Pakistan time). */
  monthPaid: number;
  /** Paid participants last calendar month: this is what set this month's percent. */
  lastMonthPaid: number;
  /** Paid participants still needed THIS month to earn 10% NEXT month (Automatic mode only); null once reached or in Manual mode. */
  toNextStep: number | null;
  earnedPkr: number;
  balancePkr: number;
  /** Foreign commission the owner has not converted to PKR yet, per currency. */
  waiting: { currency: string; amount: number }[];
  totals: { views: number; registered: number; paid: number };
  links: AffiliatePageLink[];
  supportWa: string;
  /** This affiliate's standing on the leaderboards. Both null with an empty boardUrl means it could not be loaded: the card is hidden. */
  rank: { all: OwnRank | null; month: OwnRank | null; boardUrl: string };
};

export type PageModelInput = {
  affiliate: {
    name: string;
    code: string;
    team: string | null;
    commissionMode: "manual" | "automatic";
    manualPercent: number | null;
    openingSecured: number;
    openingCommission: number;
    openingWithdrawn: number;
  };
  commissions: (CommissionRow & { createdAt: string })[];
  stats: { pageId: string; views: number; registered: number; paid: number }[];
  pages: { id: string; slug: string; title: string }[];
  baseUrl: string;
  supportWa: string;
  rank: AffiliatePageModel["rank"];
  /** Defaults to now. Passed in by tests. */
  now?: Date;
};

export function buildPageModel(i: PageModelInput): AffiliatePageModel {
  const a = i.affiliate;
  const now = i.now ?? new Date();
  const live = i.commissions.filter((c) => !c.voided).length;
  const paidCount = paidSoFar(a.openingSecured, live);
  const thisMonth = monthKey(now);
  const monthPaid = paidInMonth(i.commissions, thisMonth);
  const lastMonthPaid = paidInMonth(i.commissions, previousMonthKey(thisMonth));
  const percent = commissionPercent({
    mode: a.commissionMode,
    manualPercent: a.manualPercent,
    lastMonthPaid,
    openingSecured: a.openingSecured,
    now,
  });
  const split = splitCommissions(i.commissions);
  const byPage = new Map(i.stats.map((s) => [s.pageId, s]));
  const ref = a.code.toLowerCase();
  return {
    name: a.name,
    code: a.code,
    team: a.team,
    percent,
    automatic: a.commissionMode === "automatic",
    paidCount,
    monthPaid,
    lastMonthPaid,
    toNextStep: a.commissionMode === "automatic" && monthPaid < AUTO_STEP ? AUTO_STEP - monthPaid : null,
    earnedPkr: round2(a.openingCommission + split.earnedPkr),
    balancePkr: balancePkr({ openingCommission: a.openingCommission, openingWithdrawn: a.openingWithdrawn, pkrCommissions: [split.earnedPkr] }),
    waiting: split.waiting,
    totals: i.stats.reduce(
      (t, s) => ({ views: t.views + s.views, registered: t.registered + s.registered, paid: t.paid + s.paid }),
      { views: 0, registered: 0, paid: 0 },
    ),
    links: i.pages.map((p) => {
      const s = byPage.get(p.id);
      return { pageId: p.id, title: p.title, url: `${i.baseUrl}/e/${p.slug}?ref=${ref}`, views: s?.views ?? 0, registered: s?.registered ?? 0, paid: s?.paid ?? 0 };
    }),
    supportWa: i.supportWa,
    rank: i.rank,
  };
}

/** Null for an unknown, malformed or non-accepted token. A read error is thrown so the page can say "try again". */
export async function getAffiliatePageModel(token: string): Promise<AffiliatePageModel | null> {
  if (!TOKEN_RE.test(token)) return null;
  const admin = createAdminSupabase();
  const { data: row, error } = await admin
    .from("affiliates")
    .select("id, name, code, team, commission_mode, manual_percent, opening_secured, opening_commission, opening_withdrawn")
    .eq("token", token)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) throw error;
  if (!row || !row.code) return null;

  const [commissions, stats, pages] = await Promise.all([
    admin.from("affiliate_commissions").select("currency, commission, commission_pkr, voided_at, created_at").eq("affiliate_id", row.id),
    admin.rpc("affiliate_link_stats", { p_affiliate_id: row.id }),
    listPublishedLinkPages(),
  ]);
  if (commissions.error) throw commissions.error;
  if (stats.error) throw stats.error;

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
  // The rank card is a bonus: if it cannot load, the rest of the page must still show.
  let rank: AffiliatePageModel["rank"] = { all: null, month: null, boardUrl: "" };
  try {
    const [own, boardToken] = await Promise.all([getAffiliateRank(row.id), getBoardToken()]);
    rank = { ...own, boardUrl: `${baseUrl}/affiliate-board/${boardToken}` };
  } catch (e) {
    console.error("affiliate rank failed to load", e);
  }

  return buildPageModel({
    affiliate: {
      name: row.name,
      code: row.code,
      team: row.team,
      commissionMode: row.commission_mode === "manual" ? "manual" : "automatic",
      manualPercent: row.manual_percent === null ? null : Number(row.manual_percent),
      openingSecured: row.opening_secured,
      openingCommission: Number(row.opening_commission),
      openingWithdrawn: Number(row.opening_withdrawn),
    },
    commissions: (commissions.data ?? []).map((c) => ({
      currency: c.currency,
      commission: Number(c.commission),
      commissionPkr: c.commission_pkr === null ? null : Number(c.commission_pkr),
      voided: c.voided_at !== null,
      createdAt: c.created_at,
    })),
    stats: (stats.data ?? []).map((s) => ({ pageId: s.page_id, views: Number(s.views), registered: Number(s.registered), paid: Number(s.paid) })),
    pages,
    baseUrl,
    supportWa: affiliateSupportWa(),
    rank,
  });
}
