"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useSalesBudget } from "@/components/sales/SalesBudgetProvider";
import {
  courseOptions,
  filterAudience,
  outcomeOptions,
  type AudienceFilter,
  type AudienceRowJson,
} from "@/lib/crm/campaign-ui";
import { MAX_CAMPAIGN_RECIPIENTS, splitTodayTomorrow } from "@/lib/crm/campaign-rules";
import { DEFAULT_MESSAGE, outcomeLabel, type AgentBudgetJson } from "@/lib/crm/sales-ui";
import { DEFAULT_FOLLOWUP_HOURS, type FollowupHours } from "@/lib/crm/followup";

export type WizardStep = 1 | 2 | 3;

const STEPS: readonly { n: WizardStep; label: string }[] = [
  { n: 1, label: "Choose who" },
  { n: 2, label: "Write message" },
  { n: 3, label: "Check and send" },
];

const EMPTY_FILTER: AudienceFilter = { q: "", outcome: "", course: "" };
const ADD_LEAD_HREF = "/dashboard/sales/add-lead";

const OUTCOME_CHIP: Record<string, string> = {
  interested: "bg-pz-primary-container/30 text-pz-on-primary-container",
  replied: "bg-pz-secondary-fixed text-pz-on-secondary-fixed",
  bought: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed",
  not_interested: "bg-pz-surface-container-high text-pz-on-surface-variant",
};
const NEW_CHIP = "bg-pz-surface-container-high text-pz-on-surface-variant";

const fieldCls =
  "h-10 max-md:min-h-11 rounded-lg bg-pz-surface-container-low px-3 text-sm text-pz-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary";
const ghostBtnCls =
  "h-9 max-md:min-h-11 px-3 rounded-lg bg-pz-surface-container-low hover:bg-pz-surface-container-high text-pz-on-surface text-xs font-headline font-bold transition-colors disabled:opacity-50";
const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 h-12 max-md:min-h-11 px-5 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-sm shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

type Audience = { rows: AudienceRowJson[]; truncated: boolean };

function OutcomeChip({ outcome }: { outcome: string | null }) {
  const cls = outcome ? OUTCOME_CHIP[outcome] ?? NEW_CHIP : NEW_CHIP;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-headline font-bold ${cls}`}>
      {outcomeLabel(outcome)}
    </span>
  );
}

function Stepper({ step }: { step: WizardStep }) {
  return (
    <nav aria-label="Campaign steps" className="bg-pz-surface-container-low p-1.5 rounded-xl">
      <ol className="grid grid-cols-3 gap-1.5 md:flex md:items-center md:gap-2">
        {STEPS.map((s, i) => {
          const current = s.n === step;
          const done = s.n < step;
          return (
            <li
              key={s.n}
              aria-current={current ? "step" : undefined}
              className={`flex items-center justify-center md:justify-start gap-2 px-2 md:px-3.5 py-2 rounded-lg min-w-0 ${
                current ? "bg-pz-primary text-pz-on-primary shadow-sm" : "text-pz-on-surface-variant"
              }`}
            >
              <span
                className={`w-5 h-5 shrink-0 rounded-full text-xs font-headline font-bold flex items-center justify-center ${
                  current
                    ? "bg-pz-primary-container text-pz-on-primary-container"
                    : done
                      ? "bg-pz-primary-container/30 text-pz-on-primary-container"
                      : "bg-pz-surface-container-high text-pz-on-surface-variant"
                }`}
              >
                {s.n}
              </span>{" "}
              <span className={`text-xs font-headline truncate ${current ? "font-bold" : "font-medium"}`}>{s.label}</span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="hidden md:block h-4 w-4 shrink-0 text-pz-outline ml-1" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function CampaignWizard() {
  const { budgets, selected: number } = useSalesBudget();

  // All wizard state lives here so steps 2 and 3 can read and change it.
  const [step, setStep] = useState<WizardStep>(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<AudienceFilter>(EMPTY_FILTER);
  const [message, setMessage] = useState<string>(DEFAULT_MESSAGE);
  const [templateId, setTemplateId] = useState<string>("");
  const [followupHours, setFollowupHours] = useState<FollowupHours>(DEFAULT_FOLLOWUP_HOURS);

  const [audience, setAudience] = useState<Audience | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/sales/campaigns/audience", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Audience;
      setAudience({ rows: data.rows, truncated: data.truncated });
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const draft: CampaignDraft = { message, setMessage, templateId, setTemplateId, followupHours, setFollowupHours };

  return (
    <div className="flex flex-col gap-5 max-lg:pb-24">
      <Stepper step={step} />
      {step === 1 ? (
        <StepWho
          audience={audience}
          loadError={loadError}
          onRetry={() => void load()}
          filter={filter}
          setFilter={setFilter}
          selected={selected}
          setSelected={setSelected}
          budgets={budgets}
          remainingToday={number ? Math.max(0, number.budget.dailyCap - number.budget.dailyUsed) : null}
          onNext={() => setStep(2)}
        />
      ) : (
        <StepPlaceholder draft={draft} onBack={() => setStep(1)} />
      )}
    </div>
  );
}

function StepWho({
  audience, loadError, onRetry, filter, setFilter, selected, setSelected, budgets, remainingToday, onNext,
}: {
  audience: Audience | null;
  loadError: boolean;
  onRetry: () => void;
  filter: AudienceFilter;
  setFilter: React.Dispatch<React.SetStateAction<AudienceFilter>>;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  budgets: AgentBudgetJson[] | null;
  remainingToday: number | null;
  onNext: () => void;
}) {
  const rows = useMemo(() => audience?.rows ?? [], [audience]);
  const shown = useMemo(() => filterAudience(rows, filter), [rows, filter]);
  const courses = useMemo(() => courseOptions(rows), [rows]);
  const outcomes = useMemo(() => outcomeOptions(rows), [rows]);

  if (loadError) {
    return (
      <div role="alert" className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-3 items-start">
        <p className="text-sm text-pz-on-surface">We couldn&apos;t load your contacts. Please try again.</p>
        <button type="button" onClick={onRetry} className={primaryBtnCls}>Retry</button>
      </div>
    );
  }
  if (audience === null) {
    return <div role="status" aria-label="Loading your contacts" className="h-96 rounded-xl bg-pz-surface-container-low animate-pulse" />;
  }
  if (rows.length === 0) {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl shadow-sm">
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="You don't own any contacts yet. Ask your admin to assign a list, or add a lead."
          action={{ label: "Add a lead", href: ADD_LEAD_HREF }}
        />
      </section>
    );
  }

  const count = selected.size;
  const tooMany = count > MAX_CAMPAIGN_RECIPIENTS;
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAllShown = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const r of shown) next.add(r.id);
      return next;
    });
  const split = remainingToday === null ? null : splitTodayTomorrow(count, remainingToday);
  const filtered = filter.q !== "" || filter.course !== "" || filter.outcome !== "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
        <section aria-label="Filters" className="bg-pz-surface-container-lowest p-4 md:p-5 rounded-xl shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-pz-surface-container-low px-3">
            <Search className="h-4 w-4 shrink-0 text-pz-outline" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search by name or phone"
              placeholder="Search by name or phone"
              value={filter.q}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
              className="h-10 max-md:min-h-11 w-full bg-transparent text-sm text-pz-on-surface placeholder:text-pz-outline focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-headline font-bold text-pz-on-surface-variant">
              Course
              <select
                value={filter.course}
                onChange={(e) => setFilter((f) => ({ ...f, course: e.target.value }))}
                className={fieldCls}
              >
                <option value="">All courses</option>
                {courses.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-headline font-bold text-pz-on-surface-variant">
              Last outcome
              <select
                value={filter.outcome}
                onChange={(e) => setFilter((f) => ({ ...f, outcome: e.target.value }))}
                className={fieldCls}
              >
                <option value="">Anyone</option>
                {outcomes.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {audience.truncated && (
          <p className="text-xs text-pz-on-surface-variant px-1">Showing your 3000 most recent contacts.</p>
        )}

        <div className="bg-pz-surface-container-lowest px-4 md:px-5 py-3 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-pz-on-surface-variant">
            {shown.length} of {rows.length} shown
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={selectAllShown} disabled={shown.length === 0} className={ghostBtnCls}>
              Select all {shown.length} shown
            </button>
            <button type="button" onClick={() => setSelected(new Set())} disabled={count === 0} className={ghostBtnCls}>
              Clear
            </button>
          </div>
        </div>

        <ResponsiveList
          rows={shown}
          getKey={(r) => r.id}
          empty={
            <div className="bg-pz-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-pz-on-surface">Nobody matches these filters.</p>
              {filtered && (
                <button type="button" onClick={() => setFilter(EMPTY_FILTER)} className={ghostBtnCls}>
                  Clear filters
                </button>
              )}
            </div>
          }
          mobile={{
            title: (r) => r.fullName,
            meta: (r) => [
              <span key="p" className="tabular-nums">{r.phone}</span>,
              <OutcomeChip key="o" outcome={r.lastOutcome} />,
            ],
          }}
          selection={{
            isSelected: (r) => selected.has(r.id),
            onToggle: (r) => toggle(r.id),
            label: (r) => `Select ${r.fullName}`,
          }}
          table={
            <ul className="flex flex-col gap-2.5">
              {shown.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-3.5 p-4 rounded-xl bg-pz-surface-container-lowest hover:bg-pz-surface-container-low shadow-sm cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-pz-primary"
                      aria-label={`Select ${r.fullName}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-headline font-bold text-pz-on-surface truncate">{r.fullName}</span>
                      <span className="block mt-0.5 text-xs text-pz-on-surface-variant tabular-nums">{r.phone}</span>
                    </span>
                    <OutcomeChip outcome={r.lastOutcome} />
                  </label>
                </li>
              ))}
            </ul>
          }
        />
      </div>

      <aside className="lg:col-span-4 flex flex-col gap-4 max-lg:order-first lg:sticky lg:top-24">
        {budgets !== null && (
          <section aria-label="Today's sending" className="bg-pz-surface-container-lowest p-4 md:p-5 rounded-xl shadow-sm flex flex-col gap-3">
            {split === null || remainingToday === null ? (
              <p className="text-sm text-pz-on-surface">
                No WhatsApp number yet. Ask your admin to give you one before you can start.
              </p>
            ) : (
              <>
                <p className="text-sm text-pz-on-surface">
                  {`You can send ${remainingToday} more today; the rest wait for tomorrow`}
                </p>
                {count > 0 && (
                  <>
                    <div className="h-2 rounded-full bg-pz-surface-container-high overflow-hidden flex" aria-hidden="true">
                      <div className="h-full bg-pz-primary" style={{ width: `${(split.today / count) * 100}%` }} />
                      <div className="h-full bg-pz-secondary-container" style={{ width: `${(split.tomorrow / count) * 100}%` }} />
                    </div>
                    <p className="flex justify-between text-[11px] font-headline font-bold">
                      <span className="text-pz-primary">Today: {split.today}</span>
                      <span className="text-pz-secondary">Tomorrow: {split.tomorrow}</span>
                    </p>
                  </>
                )}
              </>
            )}
          </section>
        )}

        <div className="fixed bottom-16 inset-x-0 z-40 lg:static lg:z-auto bg-pz-surface-container-lowest px-4 py-3 shadow-lg lg:shadow-sm lg:rounded-xl lg:p-5">
          <div className="flex items-center justify-between gap-3 max-w-lg mx-auto lg:max-w-none lg:flex-col lg:items-stretch">
            <div className="flex flex-col min-w-0">
              <span className="text-base font-headline font-bold text-pz-on-surface" aria-live="polite">{count} selected</span>
              {tooMany && <span className="text-xs text-pz-danger">Pick {MAX_CAMPAIGN_RECIPIENTS} people or fewer.</span>}
            </div>
            <button
              type="button"
              onClick={onNext}
              disabled={count === 0 || tooMany}
              className={`${primaryBtnCls} max-lg:flex-1`}
            >
              Next: Write message
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export type CampaignDraft = {
  message: string; setMessage: (v: string) => void;
  templateId: string; setTemplateId: (v: string) => void;
  followupHours: FollowupHours; setFollowupHours: (v: FollowupHours) => void;
};

// Task 8 replaces this with the real Write message and Check and send steps, which read and change `draft`.
function StepPlaceholder({ onBack }: { draft: CampaignDraft; onBack: () => void }) {
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-3 items-start">
      <button type="button" onClick={onBack} className={ghostBtnCls}>
        <ArrowLeft className="inline h-4 w-4 mr-1" aria-hidden="true" />
        Back
      </button>
    </section>
  );
}
