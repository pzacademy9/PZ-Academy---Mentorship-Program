"use client";

// src/components/affiliates/AffiliatePage.tsx
// An affiliate's private page: who they are, their numbers, their money and a link per open course.
// Layout follows the Stitch screens "Your Affiliate Page" (390px and 1440px). The preview toggles, the top menu,
// the Payouts and Marketing Kit tabs and the footer links on those screens are not part of the product.
import { useState } from "react";
import type { AffiliatePageModel } from "@/lib/data/affiliate-page";
import { AUTO_STEP } from "@/lib/affiliates/commission";

const TEAM_DOT: Record<string, string> = {
  Green: "bg-green-500",
  White: "bg-slate-200 border border-landing-border",
  Yellow: "bg-yellow-400",
  Blue: "bg-sky-500",
  Pink: "bg-pink-400",
};

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const pkr = (n: number) => `PKR ${num(n)}`;

const CARD = "rounded-2xl border border-landing-border bg-white p-4 shadow-landing-soft md:p-6";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-landing-muted";
const SOFT_BUTTON =
  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full border border-landing-border bg-white px-4 py-2 text-xs font-bold text-landing-primary";

function CopyButton({ text, label, aria, className = SOFT_BUTTON }: { text: string; label: string; aria: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Copying can be blocked (private mode, old browser). The text is on screen, so it can be selected by hand.
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={aria} className={className}>
      {copied ? "Copied" : label}
    </button>
  );
}

export function AffiliatePage({ model }: { model: AffiliatePageModel }) {
  const m = model;
  const certificate = m.paidCount >= AUTO_STEP;
  const tiles: [string, number][] = [
    ["Views", m.totals.views],
    ["Registered", m.totals.registered],
    ["Paid", m.totals.paid],
  ];

  return (
    <div data-testid="affiliate-page" className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 md:gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-landing-primary">Pharmacozyme Affiliate Programme</p>
        <h1 className="mt-1 font-headline text-2xl font-extrabold text-landing-deep md:text-4xl">Your affiliate page</h1>
      </header>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
        <section className={CARD}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 break-words font-headline text-lg font-bold text-landing-deep md:text-2xl">{`Hello, ${m.name}`}</h2>
            {m.team && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-landing-mint-light px-3 py-1 text-xs font-semibold text-landing-deep">
                <span aria-hidden className={`h-2 w-2 rounded-full ${TEAM_DOT[m.team] ?? "bg-slate-300"}`} />
                {`${m.team} team`}
              </span>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-landing-surface p-3">
            <div className="min-w-0">
              <p className={LABEL}>Affiliate code</p>
              <p className="break-all font-headline text-xl font-extrabold tracking-wider text-landing-deep md:text-2xl">{m.code}</p>
            </div>
            <CopyButton text={m.code} label="Copy" aria="Copy code" />
          </div>
        </section>

        <section className={CARD}>
          <h2 className="font-headline text-lg font-bold text-landing-deep md:text-2xl">{`Your commission: ${m.percent}%`}</h2>
          {m.toNextStep !== null && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-landing-muted">
                <span>{`${m.monthPaid} of ${AUTO_STEP} paid participants this month`}</span>
                <span className="font-semibold text-landing-primary">{`${Math.min(100, Math.round((m.monthPaid / AUTO_STEP) * 100))}%`}</span>
              </div>
              <div
                role="progressbar"
                aria-label="Paid participants this month towards 10% next month"
                aria-valuemin={0}
                aria-valuemax={AUTO_STEP}
                aria-valuenow={m.monthPaid}
                className="h-3 w-full overflow-hidden rounded-full bg-landing-surface-container-low p-0.5"
              >
                <div className="h-full rounded-full bg-landing-mint" style={{ width: `${Math.min(100, (m.monthPaid / AUTO_STEP) * 100)}%` }} />
              </div>
              <p className="text-xs text-landing-muted">{`${m.toNextStep} more paid participant${m.toNextStep === 1 ? "" : "s"} this month to earn 10% next month`}</p>
            </div>
          )}
          {m.automatic && m.toNextStep === null && (
            <p className="mt-3 text-xs text-landing-muted">You have reached 10 paid participants this month, so you earn 10% next month.</p>
          )}
          {m.automatic && (
            <p className="mt-3 text-xs text-landing-muted">{`Last month: ${m.lastMonthPaid} paid participant${m.lastMonthPaid === 1 ? "" : "s"}. Each month, 10 paid participants earn 10% for the next month. Fewer than 10 means 8%.`}</p>
          )}
          {certificate && (
            <p className="mt-3 rounded-2xl bg-landing-mint-light p-3 text-sm font-bold text-landing-deep">Certificate of Achievement unlocked</p>
          )}
        </section>
      </div>

      <section className="grid grid-cols-3 gap-2.5 md:gap-6">
        {tiles.map(([label, n]) => (
          <div key={label} data-testid={`tile-${label.toLowerCase()}`} className="rounded-2xl border border-landing-border bg-white p-3 text-center shadow-landing-soft md:p-6 md:text-left">
            <p className="text-xs font-medium text-landing-muted md:font-semibold md:uppercase md:tracking-wide">{label}</p>
            <p className="font-headline text-xl font-extrabold text-landing-deep md:text-3xl">{num(n)}</p>
          </div>
        ))}
      </section>

      <section className={CARD}>
        <div className="grid grid-cols-2 gap-3">
          <div data-testid="earned" className="rounded-2xl bg-landing-surface p-3 md:p-5">
            <p className="text-xs font-medium text-landing-muted">Earned</p>
            <p className="mt-0.5 break-words font-headline text-lg font-extrabold text-landing-deep md:text-3xl">{pkr(m.earnedPkr)}</p>
          </div>
          <div data-testid="balance" className="rounded-2xl bg-landing-surface p-3 md:p-5">
            <p className="text-xs font-medium text-landing-muted">Balance</p>
            <p className="mt-0.5 break-words font-headline text-lg font-extrabold text-landing-deep md:text-3xl">{pkr(m.balancePkr)}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 text-xs leading-relaxed text-landing-muted">
          <p>Commission is counted after the student&apos;s payment is confirmed.</p>
          {m.waiting.length > 0 && (
            <p className="font-medium text-landing-primary">
              {`Waiting to be converted to PKR: ${m.waiting.map((w) => `${w.currency} ${num(w.amount)}`).join(", ")}`}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 font-headline text-base font-bold text-landing-deep md:text-2xl">Your links</h2>
        {m.links.length === 0 ? (
          <div className={`${CARD} text-center`}>
            <p className="font-headline text-sm font-semibold text-landing-deep">No open courses right now.</p>
            <p className="mt-1 text-xs text-landing-muted">Check back soon for new courses.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {m.links.map((l) => (
              <li key={l.pageId} data-testid={`link-${l.pageId}`} className={`${CARD} min-w-0 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-6`}>
                <h3 className="break-words font-headline text-sm font-bold leading-snug text-landing-deep md:text-base">{l.title}</h3>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-landing-surface p-2 pl-3 md:mt-0">
                  <span className="min-w-0 flex-1 truncate text-xs text-landing-muted">{l.url}</span>
                  <CopyButton text={l.url} label="Copy link" aria={`Copy link for ${l.title}`} />
                </div>
                <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-landing-muted md:mt-0">
                  <span>{`Views ${num(l.views)}`}</span>
                  <span>{`Registered ${num(l.registered)}`}</span>
                  <span className="font-medium text-landing-primary">{`Paid ${num(l.paid)}`}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-col gap-3 pb-4 pt-2 md:flex-row md:items-center md:justify-between">
        <p className="px-4 text-center text-xs leading-relaxed text-landing-muted md:px-0 md:text-left">Keep this page private. Anyone with the link can open it.</p>
        <a
          href={m.supportWa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-landing-mint px-6 py-3 font-headline text-sm font-bold text-landing-deep md:w-auto"
        >
          Message support
        </a>
      </footer>
    </div>
  );
}
