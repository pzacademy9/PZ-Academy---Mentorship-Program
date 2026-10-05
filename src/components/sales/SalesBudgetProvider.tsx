"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pickDefaultNumber, type AgentBudgetJson, type BudgetJson } from "@/lib/crm/sales-ui";

export type SalesBudgetValue = {
  budgets: AgentBudgetJson[] | null;
  loadError: boolean;
  selectedId: string | null;
  selected: AgentBudgetJson | null;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  applyBudget: (numberId: string, budget: BudgetJson) => void;
};

export const SalesBudgetContext = createContext<SalesBudgetValue | null>(null);

const POLL_MS = 60_000;

export function SalesBudgetProvider({ children }: { children: React.ReactNode }) {
  const [budgets, setBudgets] = useState<AgentBudgetJson[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/budget", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { budgets: AgentBudgetJson[] };
      setBudgets(data.budgets);
      setLoadError(false);
      setSelectedId((cur) => (cur && data.budgets.some((b) => b.number.id === cur) ? cur : pickDefaultNumber(data.budgets)));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const applyBudget = useCallback((numberId: string, budget: BudgetJson) => {
    setBudgets((cur) => cur?.map((b) => (b.number.id === numberId ? { ...b, budget } : b)) ?? cur);
  }, []);

  const value = useMemo<SalesBudgetValue>(
    () => ({
      budgets,
      loadError,
      selectedId,
      selected: budgets?.find((b) => b.number.id === selectedId) ?? null,
      select: setSelectedId,
      refresh,
      applyBudget,
    }),
    [budgets, loadError, selectedId, refresh, applyBudget],
  );
  return <SalesBudgetContext.Provider value={value}>{children}</SalesBudgetContext.Provider>;
}

export function useSalesBudget(): SalesBudgetValue {
  const ctx = useContext(SalesBudgetContext);
  if (!ctx) throw new Error("useSalesBudget must be used inside <SalesBudgetProvider>");
  return ctx;
}
