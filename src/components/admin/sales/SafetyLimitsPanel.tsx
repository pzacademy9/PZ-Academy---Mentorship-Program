"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert, Snowflake } from "lucide-react";
import type { SafetySettings } from "@/lib/crm/send-limits";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { HONEST_NOTE } from "@/lib/crm/sales-help-copy";
import { ADMIN_BATCH_NOTE, pausedNumbers, type BlockedAttemptJson, type NumberAdminJson } from "@/lib/crm/sales-admin-ui";
import { formatDateTime } from "@/lib/format";
import { NumbersSection } from "./NumbersSection";
import { SettingsSection } from "./SettingsSection";
import { BlockedLog } from "./BlockedLog";

type Loaded = {
  numbers: NumberAdminJson[];
  budgets: Map<string, BudgetJson>;
  settings: SafetySettings;
  log: BlockedAttemptJson[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

export function SafetyLimitsPanel({ agents }: { agents: { id: string; fullName: string }[] }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, b, s, l] = await Promise.all([
        getJson<{ numbers: NumberAdminJson[] }>("/api/admin/sales/numbers"),
        getJson<{ budgets: AgentBudgetJson[] }>("/api/sales/budget"),
        getJson<{ settings: SafetySettings }>("/api/admin/sales/settings"),
        getJson<{ rows: BlockedAttemptJson[] }>("/api/admin/sales/blocked-attempts"),
      ]);
      setError(false);
      setData({
        numbers: n.numbers,
        budgets: new Map(b.budgets.map((x) => [x.number.id, x.budget])),
        settings: s.settings,
        log: l.rows,
      });
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const paused = useMemo(() => (data ? pausedNumbers(data.numbers, data.log, new Date()) : []), [data]);

  if (error && !data) {
    return (
      <section role="status" className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-wrap items-center gap-3 font-body text-sm text-pz-on-surface">
        <span>Could not load the WhatsApp safety settings.</span>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 min-h-11 rounded-lg bg-pz-surface-container-low font-headline text-xs font-bold text-pz-on-surface hover:shadow-sm transition-all"
        >
          Try again
        </button>
      </section>
    );
  }
  if (!data) {
    return <div role="status" aria-label="Loading safety settings" className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {paused.length > 0 && (
        <div role="alert" className="bg-pz-error-container text-pz-on-error-container rounded-xl p-4 text-sm flex flex-col gap-1">
          {paused.map((p) => (
            <p key={p.id} className="flex items-center gap-2">
              <Snowflake className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{p.label}</strong> is paused {p.until ? `until ${formatDateTime(p.until)}` : "with no end date"}
                {p.byAgent ? `. ${p.byAgent} reported a WhatsApp warning.` : "."}
              </span>
            </p>
          ))}
        </div>
      )}
      <div className="bg-pz-surface-container-lowest rounded-xl p-4 md:p-5 shadow-sm flex items-start gap-4">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-pz-tertiary-container/40 flex items-center justify-center shrink-0 text-pz-primary">
          <ShieldAlert className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1 font-body text-xs md:text-sm text-pz-on-surface-variant leading-relaxed max-w-3xl">
          <p>{HONEST_NOTE}</p>
          <p>{ADMIN_BATCH_NOTE}</p>
        </div>
      </div>
      <NumbersSection numbers={data.numbers} budgets={data.budgets} agents={agents} plainDailyCap={data.settings.daily_cap} onChanged={load} />
      <SettingsSection settings={data.settings} onSaved={(settings) => setData((d) => (d ? { ...d, settings } : d))} />
      <BlockedLog rows={data.log} />
    </div>
  );
}
