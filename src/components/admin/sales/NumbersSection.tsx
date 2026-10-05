"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { PauseCircle, PlayCircle, Phone, Plus, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { normalizePhone } from "@/lib/crm/phone";
import { budgetLine, hourLine, type BudgetJson } from "@/lib/crm/sales-ui";
import { numberStatusLabel, type NumberAdminJson } from "@/lib/crm/sales-admin-ui";

type Agent = { id: string; fullName: string };
type FormValues = { label: string; phone: string; daily: string; hourly: string; agentIds: string[] };

const COLS = "lg:grid lg:grid-cols-[2fr_1fr_1.5fr_1fr_auto] lg:items-center lg:gap-4";
const fieldClass =
  "w-full bg-pz-surface-container-low rounded-lg px-3 py-2 max-md:min-h-11 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const labelClass = "block text-xs font-headline font-semibold text-pz-on-surface-variant mb-1";

function whole(v: string, min: number, max: number): boolean {
  if (v.trim() === "") return true;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max;
}

function NumberForm({
  initial, agents, submitLabel, onSubmit, onCancel,
}: {
  initial: FormValues; agents: Agent[]; submitLabel: string;
  onSubmit: (v: FormValues) => Promise<boolean>; onCancel: () => void;
}) {
  const uid = useId();
  const [v, setV] = useState<FormValues>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const { run, pending } = useAsyncAction(async () => {
    if (v.label.trim() === "") return setProblem("Give the number a label, for example the campaign name.");
    if (!whole(v.daily, 1, 500)) return setProblem("The daily limit must be a whole number from 1 to 500, or blank.");
    if (!whole(v.hourly, 1, 200)) return setProblem("The hourly limit must be a whole number from 1 to 200, or blank.");
    let phone = "";
    if (v.phone.trim() !== "") {
      const norm = normalizePhone(v.phone);
      if (!norm.ok) return setProblem("That phone number is not valid. Use the full number, for example +923001234567.");
      phone = norm.e164;
    }
    setProblem(null);
    const ok = await onSubmit({ ...v, phone });
    if (ok) onCancel();
  });

  return (
    <form
      className="col-span-full bg-pz-surface-container-low/50 rounded-lg p-4 flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); void run(); }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor={`nf-label-${uid}`}>Label</label>
          <input id={`nf-label-${uid}`} value={v.label} maxLength={80} onChange={(e) => setV({ ...v, label: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`nf-phone-${uid}`}>Phone number (optional)</label>
          <input id={`nf-phone-${uid}`} value={v.phone} placeholder="+923001234567" onChange={(e) => setV({ ...v, phone: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`nf-daily-${uid}`}>New chats per day for this number (blank = team default)</label>
          <input id={`nf-daily-${uid}`} type="number" inputMode="numeric" value={v.daily} onChange={(e) => setV({ ...v, daily: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`nf-hourly-${uid}`}>New chats per hour for this number (blank = team default)</label>
          <input id={`nf-hourly-${uid}`} type="number" inputMode="numeric" value={v.hourly} onChange={(e) => setV({ ...v, hourly: e.target.value })} className={fieldClass} />
        </div>
      </div>
      <fieldset>
        <legend className={labelClass}>Agents who can send from it</legend>
        {agents.length === 0 ? (
          <p className="text-xs text-pz-on-surface-variant">No sales agents yet. Invite them from Sales Team.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {agents.map((a) => (
              <label key={a.id} className="inline-flex items-center gap-2 min-h-11 lg:min-h-9 px-3 rounded-lg bg-pz-surface-container-lowest text-sm text-pz-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={v.agentIds.includes(a.id)}
                  onChange={(e) => setV({ ...v, agentIds: e.target.checked ? [...v.agentIds, a.id] : v.agentIds.filter((x) => x !== a.id) })}
                  className="w-4 h-4 accent-pz-primary"
                />
                {a.fullName}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {problem && <p role="alert" className="text-sm text-pz-academy-error">{problem}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-lowest font-headline font-semibold text-xs text-pz-on-surface">Cancel</button>
        <Button type="submit" variant="bare" size="bare" loading={pending} className="min-h-11 px-5 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-xs">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function NumbersSection({
  numbers, budgets, agents, plainDailyCap, freezeHours, onChanged,
}: {
  numbers: NumberAdminJson[]; budgets: Map<string, BudgetJson>; agents: Agent[];
  plainDailyCap: number; freezeHours: number; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const confirm = useConfirm();
  const { run: unpause } = useAsyncAction(async (row: NumberAdminJson) => {
    const ok = await confirm({
      title: `Unpause ${row.label}?`,
      description: "It restarts its warm-up from today, so it starts at the new-number level again.",
      confirmLabel: "Unpause",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/sales/numbers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unfreeze: true }),
      });
      if (!res.ok) toast.error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not unpause.");
      else toast.success(`${row.label} is active again.`);
    } catch {
      toast.error("Could not unpause.");
    }
    onChanged();
  });

  const { run: pauseNow } = useAsyncAction(async (row: NumberAdminJson) => {
    const ok = await confirm({
      title: `Pause ${row.label}?`,
      description: `Agents cannot send from it for ${freezeHours} hours, or until you unpause it.`,
      confirmLabel: "Pause now",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales/numbers/${row.id}/freeze`, { method: "POST" });
      if (!res.ok) toast.error("Could not pause this number.");
      else toast.success(`${row.label} is paused.`);
    } catch {
      toast.error("Could not pause this number.");
    }
    onChanged();
  });

  async function saveNumber(id: string | null, f: FormValues) {
    const capOrNull = (x: string) => (x.trim() === "" ? null : Number(x));
    const body = id
      ? { label: f.label.trim(), phoneE164: f.phone.trim() || null, dailyCap: capOrNull(f.daily), hourlyCap: capOrNull(f.hourly), agentIds: f.agentIds }
      : {
          label: f.label.trim(),
          ...(f.phone.trim() ? { phoneE164: f.phone.trim() } : {}),
          ...(f.daily.trim() ? { dailyCap: Number(f.daily) } : {}),
          ...(f.hourly.trim() ? { hourlyCap: Number(f.hourly) } : {}),
          agentIds: f.agentIds,
        };
    try {
      const res = await fetch(id ? `/api/admin/sales/numbers/${id}` : "/api/admin/sales/numbers", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save this number.");
        return false;
      }
    } catch {
      toast.error("Could not save this number.");
      return false;
    }
    toast.success(id ? "Number updated." : "Number added. It starts warming up today.");
    onChanged();
    return true;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-headline font-bold text-lg md:text-xl text-pz-on-surface">Connected numbers</h2>
          <span className="px-3 py-1 text-xs font-headline font-bold rounded-full bg-pz-primary-fixed text-pz-on-primary-fixed">
            {numbers.length} {numbers.length === 1 ? "number" : "numbers"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          aria-expanded={adding}
          className="inline-flex items-center gap-2 px-4 min-h-11 rounded-lg bg-pz-surface-container-lowest text-pz-on-surface font-headline font-semibold text-xs shadow-sm hover:bg-pz-surface-container-low transition-all"
        >
          <Plus className="w-4 h-4 text-pz-primary" aria-hidden="true" />
          Add WhatsApp number
        </button>
      </div>

      {adding && (
        <div className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm grid">
          <NumberForm
            initial={{ label: "", phone: "", daily: "", hourly: "", agentIds: [] }}
            agents={agents}
            submitLabel="Add number"
            onSubmit={(f) => saveNumber(null, f)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {numbers.length === 0 ? (
        <div className="bg-pz-surface-container-lowest rounded-xl shadow-sm">
          <EmptyState icon={Phone} title="No WhatsApp numbers yet" description="Add the numbers your agents send from. Each one gets its own daily limit." />
        </div>
      ) : (
        <div className="lg:bg-pz-surface-container-lowest lg:rounded-xl lg:shadow-sm lg:overflow-hidden">
          <div className={`hidden ${COLS} bg-pz-surface-container-low text-pz-on-surface-variant font-headline font-bold uppercase tracking-wider text-[11px] py-4 px-6`}>
            <span>Number &amp; label</span>
            <span>Status</span>
            <span>Today&apos;s new chats</span>
            <span>Agents</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-pz-surface-container-low">
            {numbers.map((row) => {
              const budget = budgets.get(row.id) ?? null;
              const frozen = budget ? budget.frozen : row.status === "frozen";
              const warming = !frozen && budget !== null && budget.dailyCap < (row.daily_cap ?? plainDailyCap);
              const pct = !budget || budget.dailyCap <= 0 ? 0 : Math.min(100, Math.round((budget.dailyUsed / budget.dailyCap) * 100));
              const open = editing === row.id;
              return (
                <li
                  key={row.id}
                  className={`rounded-xl p-4 shadow-sm flex flex-col gap-3 lg:rounded-none lg:shadow-none lg:px-6 lg:py-4 ${COLS} ${
                    frozen ? "bg-pz-error-container/20" : "bg-pz-surface-container-lowest"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-headline font-bold text-pz-on-surface text-sm truncate">{row.label}</span>
                    {row.phone_e164 && <span className="text-xs text-pz-on-surface-variant font-mono tracking-tight">{row.phone_e164}</span>}
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-headline font-bold ${
                        frozen
                          ? "bg-pz-error-container text-pz-on-error-container"
                          : warming
                            ? "bg-pz-secondary-container text-pz-on-secondary-container"
                            : "bg-pz-primary-fixed/50 text-pz-on-primary-fixed-variant"
                      }`}
                    >
                      {frozen && <Snowflake className="w-3 h-3" aria-hidden="true" />}
                      {numberStatusLabel(row, budget, plainDailyCap)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {budget ? (
                      <>
                        <span className="text-xs font-semibold text-pz-on-surface">{budgetLine(budget)}</span>
                        <div className="w-full h-2 rounded-full bg-pz-surface-container-low overflow-hidden" aria-hidden="true">
                          <div
                            className={`h-full rounded-full ${frozen ? "bg-pz-academy-error" : warming ? "bg-pz-secondary-container" : "bg-pz-primary-container"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-pz-on-surface-variant">{hourLine(budget)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-pz-on-surface-variant">No usage figures yet.</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.agents.length === 0 ? (
                      <span className="text-xs text-pz-on-surface-variant italic">Unassigned</span>
                    ) : (
                      row.agents.map((a) => (
                        <span key={a.id} className="px-2.5 py-1 rounded-full bg-pz-surface-container text-xs font-headline font-semibold text-pz-on-surface">
                          {a.name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => setEditing(open ? null : row.id)}
                      aria-expanded={open}
                      aria-label={`Edit ${row.label}`}
                      className="min-h-11 lg:min-h-9 px-3 rounded-lg bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container-high text-xs font-headline font-bold transition-colors"
                    >
                      Edit
                    </button>
                    {frozen ? (
                      <Button
                        type="button"
                        variant="bare"
                        size="bare"
                        aria-label={`Unpause ${row.label}`}
                        onClick={() => void unpause(row)}
                        className="min-h-11 lg:min-h-9 px-3 rounded-lg bg-pz-primary-fixed text-pz-on-primary-fixed font-headline font-bold text-xs shadow-sm hover:bg-pz-primary-container transition-all"
                      >
                        <PlayCircle className="w-4 h-4" aria-hidden="true" />
                        Unpause
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="bare"
                        size="bare"
                        aria-label={`Pause ${row.label}`}
                        onClick={() => void pauseNow(row)}
                        className="min-h-11 lg:min-h-9 px-3 rounded-lg bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-secondary-fixed/50 hover:text-pz-on-secondary-fixed-variant text-xs font-headline font-bold transition-colors"
                      >
                        <PauseCircle className="w-4 h-4" aria-hidden="true" />
                        Pause
                      </Button>
                    )}
                  </div>
                  {open && (
                    <NumberForm
                      initial={{
                        label: row.label,
                        phone: row.phone_e164 ?? "",
                        daily: row.daily_cap === null ? "" : String(row.daily_cap),
                        hourly: row.hourly_cap === null ? "" : String(row.hourly_cap),
                        agentIds: row.agents.map((a) => a.id),
                      }}
                      agents={agents}
                      submitLabel="Save number"
                      onSubmit={(f) => saveNumber(row.id, f)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
