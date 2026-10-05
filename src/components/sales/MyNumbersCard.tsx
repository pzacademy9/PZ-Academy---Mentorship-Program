"use client";

import { budgetLine } from "@/lib/crm/sales-ui";
import { formatDateTime } from "@/lib/format";
import { useSalesBudget } from "./SalesBudgetProvider";

export function MyNumbersCard() {
  const { budgets } = useSalesBudget();
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <h2 className="font-headline font-bold text-pz-on-surface">Your WhatsApp numbers</h2>
      {budgets === null ? (
        <div role="status" aria-label="Loading your numbers" className="h-16 rounded-lg bg-pz-surface-container-low animate-pulse" />
      ) : budgets.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">No number yet. Ask your admin.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {budgets.map(({ number, budget }) => (
            <li key={number.id} className="rounded-lg bg-pz-surface-container-low p-3 text-sm">
              <p className="font-headline font-semibold text-pz-on-surface">{number.label}</p>
              {number.phone_e164 && <p className="text-xs font-mono text-pz-on-surface-variant">{number.phone_e164}</p>}
              <p className="text-xs text-pz-on-surface-variant mt-1">{budgetLine(budget)}</p>
              {budget.frozen && (
                <p className="text-xs font-semibold text-pz-academy-error mt-1">
                  {budget.frozenUntil ? `Paused until ${formatDateTime(budget.frozenUntil)}` : "Paused by your admin"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-pz-on-surface-variant">Shared numbers share one limit.</p>
    </section>
  );
}
