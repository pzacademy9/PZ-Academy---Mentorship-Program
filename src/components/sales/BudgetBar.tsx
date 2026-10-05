"use client";

import { Snowflake, Moon } from "lucide-react";
import { budgetLine, hourLine } from "@/lib/crm/sales-ui";
import { formatDateTime, formatTime } from "@/lib/format";
import { useSalesBudget } from "./SalesBudgetProvider";
import { PanicButton } from "./PanicButton";

const pct = (used: number, cap: number) => (cap <= 0 ? 100 : Math.min(100, Math.round((used / cap) * 100)));

export function BudgetBar() {
  const { budgets, loadError, selected, select, refresh } = useSalesBudget();

  if (budgets === null && loadError) {
    return (
      <section
        role="status"
        className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3 font-body text-sm text-pz-on-surface"
      >
        <span>Could not load your sending budget.</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-3.5 py-2 max-md:min-h-11 rounded-lg bg-pz-surface-container-low font-headline text-xs font-bold text-pz-on-surface hover:shadow-sm transition-all"
        >
          Try again
        </button>
      </section>
    );
  }
  if (budgets === null) {
    return (
      <div role="status" aria-label="Loading your sending budget" className="h-20 rounded-xl bg-pz-surface-container-low animate-pulse" />
    );
  }
  if (budgets.length === 0) {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm font-body text-sm text-pz-on-surface">
        You have no WhatsApp number yet. Ask your admin to give you one before you start messaging.
      </section>
    );
  }
  if (!selected) return null;
  const b = selected.budget;

  return (
    <section
      aria-label="Your sending budget"
      className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 font-body"
    >
      <div className="flex flex-col gap-2 min-w-0">
        {budgets.length > 1 ? (
          <label className="inline-flex items-center gap-2 text-xs font-headline font-medium text-pz-on-surface">
            <span>Send from</span>
            <select
              aria-label="Send from"
              value={selected.number.id}
              onChange={(e) => select(e.target.value)}
              className="bg-pz-surface-container-low rounded-lg px-3 py-1.5 max-md:min-h-11 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            >
              {budgets.map((n) => (
                <option key={n.number.id} value={n.number.id}>
                  {n.number.label} ({n.budget.dailyCap - n.budget.dailyUsed} left today{n.budget.frozen ? ", paused" : ""})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-xs font-headline font-medium text-pz-on-surface">
            Using: <strong className="font-semibold">{selected.number.label}</strong>
            {selected.number.phone_e164 ? ` (${selected.number.phone_e164})` : ""}
          </span>
        )}
        {b.frozen && (
          <p role="status" className="inline-flex items-center gap-1.5 text-xs font-semibold text-pz-academy-error">
            <Snowflake className="w-4 h-4" />
            {b.frozenUntil ? `Paused until ${formatDateTime(b.frozenUntil)}` : "Paused by your admin"}
          </p>
        )}
        {!b.frozen && b.quietHours && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-pz-on-surface-variant">
            <Moon className="w-4 h-4" />
            Paused overnight{b.quietEndsAt ? `, opens at ${formatTime(b.quietEndsAt)}` : ""}
          </p>
        )}
        {loadError && <p role="status" className="text-xs text-pz-academy-error">Could not refresh your budget. Showing the last known numbers.</p>}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
        <div className="bg-pz-surface-container-low rounded-lg p-3.5 flex flex-col gap-2 sm:min-w-[220px]">
          <span className="text-xs font-headline font-bold text-pz-on-surface">{budgetLine(b)}</span>
          <div className="w-full h-2 bg-pz-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-pz-primary rounded-full transition-all duration-500" style={{ width: `${pct(b.dailyUsed, b.dailyCap)}%` }} />
          </div>
        </div>
        <div className="bg-pz-surface-container-low rounded-lg p-3.5 flex flex-col gap-2 sm:min-w-[200px]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-headline font-bold text-pz-on-surface">{hourLine(b)}</span>
            {b.hourlyWarning && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-pz-secondary-container text-pz-on-secondary-container">
                Slow down
              </span>
            )}
          </div>
          <div className="w-full h-2 bg-pz-surface-container-highest rounded-full overflow-hidden">
            <div
              className={b.hourlyWarning ? "h-full bg-pz-secondary rounded-full" : "h-full bg-pz-primary-container rounded-full"}
              style={{ width: `${pct(b.hourlyUsed, b.hourlyCap)}%` }}
            />
          </div>
        </div>
        {!b.frozen && <PanicButton />}
      </div>
    </section>
  );
}
