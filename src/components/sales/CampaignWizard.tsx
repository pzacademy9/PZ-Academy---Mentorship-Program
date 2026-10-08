"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ChevronRight, Clock, Plus, Search, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { useSalesBudget } from "@/components/sales/SalesBudgetProvider";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import {
  courseOptions,
  filterAudience,
  outcomeOptions,
  type AudienceFilter,
  type AudienceRowJson,
} from "@/lib/crm/campaign-ui";
import { MAX_CAMPAIGN_RECIPIENTS, splitTodayTomorrow, varietyBlocked, VARIETY_MESSAGE } from "@/lib/crm/campaign-rules";
import {
  DEFAULT_MESSAGE,
  MAX_MESSAGE_LENGTH,
  outcomeLabel,
  type AgentBudgetJson,
  type TemplateJson,
} from "@/lib/crm/sales-ui";
import { DEFAULT_FOLLOWUP_HOURS, FOLLOWUP_CHOICES, type FollowupHours } from "@/lib/crm/followup";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";
import { renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";

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

  // Saved messages load once, the first time step 2 opens.
  const [templates, setTemplates] = useState<TemplateJson[] | null>(null);
  const [templatesError, setTemplatesError] = useState(false);
  const wantTemplates = step >= 2;
  useEffect(() => {
    if (!wantTemplates || templates !== null) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/sales/templates", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { templates?: TemplateJson[] };
        if (alive) setTemplates(data.templates ?? []);
      } catch {
        if (alive) {
          setTemplatesError(true);
          setTemplates([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [wantTemplates, templates]);

  // The preview uses the first person picked (Set keeps insertion order).
  const previewName = useMemo(() => {
    const firstId = Array.from(selected)[0];
    if (firstId === undefined) return "";
    return audience?.rows.find((r) => r.id === firstId)?.fullName ?? "";
  }, [selected, audience]);

  const draft: CampaignDraft = { message, setMessage, templateId, setTemplateId, followupHours, setFollowupHours };

  return (
    <div className="flex flex-col gap-5 max-lg:pb-24">
      <Stepper step={step} />
      {step === 2 ? (
        <StepWrite
          draft={draft}
          count={selected.size}
          previewName={previewName}
          templates={templates}
          templatesError={templatesError}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      ) : step === 3 ? (
        <StepCheck draft={draft} selected={selected} previewName={previewName} onBack={() => setStep(2)} />
      ) : (
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
  const shownIds = new Set(shown.map((r) => r.id));
  const hiddenSelected = Array.from(selected).filter((id) => !shownIds.has(id)).length;

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
              {hiddenSelected > 0 && (
                <span className="text-xs text-pz-on-surface-variant">{hiddenSelected} hidden by filters</span>
              )}
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

const NAME_TAGS: readonly { label: string; tag: string }[] = [
  { label: "First name", tag: "{{first_name}}" },
  { label: "Full name", tag: "{{full_name}}" },
];

/** Appends a tag at the end of the message, with a space when the text does not already end in one. */
function withTag(message: string, tag: string): string {
  return message === "" || /\s$/.test(message) ? message + tag : `${message} ${tag}`;
}

const backBtnCls =
  "inline-flex items-center justify-center gap-1.5 h-12 max-md:min-h-11 px-4 rounded-lg bg-pz-surface-container-low hover:bg-pz-surface-container-high text-pz-on-surface font-headline font-bold text-sm transition-colors";
// Mirrors SendPanel's primary button: the disabled state stays readable instead of fading out.
const startBtnCls =
  "h-12 max-md:min-h-11 px-5 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:bg-pz-surface-container-high disabled:text-pz-on-surface-variant disabled:shadow-none disabled:opacity-100";
// Fixed above the phone tab bar, an ordinary card from lg up (same as step 1).
const actionBarCls =
  "fixed bottom-16 inset-x-0 z-40 lg:static lg:z-auto bg-pz-surface-container-lowest px-4 py-3 shadow-lg lg:shadow-sm lg:rounded-xl lg:p-5";

function MessagePreview({ text }: { text: string }) {
  return (
    <section aria-label="What they will see" className="bg-pz-surface-container-lowest p-4 md:p-5 rounded-xl shadow-sm flex flex-col gap-3">
      <h2 className="text-xs font-headline font-bold text-pz-on-surface-variant">What they will see</h2>
      <div className="bg-pz-surface-container-low rounded-xl p-4">
        <p className="bg-pz-surface-container-lowest rounded-lg p-4 shadow-sm text-sm text-pz-on-surface leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </p>
      </div>
    </section>
  );
}

function StepWrite({
  draft, count, previewName, templates, templatesError, onBack, onNext,
}: {
  draft: CampaignDraft;
  count: number;
  previewName: string;
  templates: TemplateJson[] | null;
  templatesError: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const { message, setMessage, templateId, setTemplateId } = draft;
  const empty = message.trim() === "";
  const tooLong = message.length > MAX_MESSAGE_LENGTH;
  const blocked = varietyBlocked(message, count);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates?.find((x) => x.id === id);
    if (t) setMessage(t.body);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        <div className="bg-pz-secondary-fixed/30 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <span className="w-8 h-8 shrink-0 rounded-lg bg-pz-secondary-container text-pz-on-secondary-container flex items-center justify-center">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm text-pz-on-surface leading-relaxed">
            Messages go out one at a time from your own WhatsApp, with pauses.
          </p>
        </div>

        <section aria-label="Your message" className="bg-pz-surface-container-lowest p-4 md:p-5 rounded-xl shadow-sm flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs font-headline font-bold text-pz-on-surface-variant">
            Saved message
            <select
              aria-label="Saved message"
              value={templateId}
              onChange={(e) => pickTemplate(e.target.value)}
              disabled={templates === null || templates.length === 0}
              className={`${fieldCls} disabled:opacity-60`}
            >
              <option value="">{templates !== null && templates.length === 0 ? "No saved messages yet" : "Pick a saved message"}</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          {templates === null && (
            <span role="status" aria-label="Loading saved messages" className="text-xs text-pz-on-surface-variant -mt-2">Loading saved messages…</span>
          )}
          {templatesError && (
            <span className="text-xs text-pz-on-surface-variant -mt-2">Saved messages could not load. You can still write your own.</span>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-headline font-bold text-pz-on-surface-variant">Add their name</span>
            <div className="flex flex-wrap gap-2">
              {NAME_TAGS.map(({ label, tag }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setMessage(withTag(message, tag))}
                  disabled={withTag(message, tag).length > MAX_MESSAGE_LENGTH}
                  className="inline-flex items-center gap-1.5 h-9 max-md:min-h-11 px-3 rounded-lg bg-pz-surface-container-high hover:bg-pz-primary-container/30 text-pz-on-surface text-xs font-headline font-semibold transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5 text-pz-primary" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="campaign-message" className="text-xs font-headline font-bold text-pz-on-surface-variant">
              Message
            </label>
            <textarea
              id="campaign-message"
              rows={7}
              maxLength={MAX_MESSAGE_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby={blocked ? "campaign-variety" : undefined}
              className="w-full rounded-lg bg-pz-surface-container-low p-3.5 text-sm text-pz-on-surface leading-relaxed resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary"
            />
            <span className={`text-[11px] self-end tabular-nums ${tooLong ? "text-pz-danger" : "text-pz-on-surface-variant"}`}>
              {message.length} / {MAX_MESSAGE_LENGTH}
            </span>
            {blocked && (
              <p id="campaign-variety" role="alert" className="text-xs text-pz-danger leading-relaxed">
                {VARIETY_MESSAGE}
              </p>
            )}
            {tooLong && (
              <p role="alert" className="text-xs text-pz-danger">Keep the message to {MAX_MESSAGE_LENGTH} characters or fewer.</p>
            )}
          </div>
        </section>
      </div>

      <aside className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-24">
        <MessagePreview text={renderWhatsAppMessage(message, previewName)} />
        <div className={actionBarCls}>
          <div className="flex items-center gap-3 max-w-lg mx-auto lg:max-w-none">
            <button type="button" onClick={onBack} className={backBtnCls}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button type="button" onClick={onNext} disabled={empty || tooLong || blocked} className={`${primaryBtnCls} flex-1`}>
              Next: Check and send
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

type CreateCampaignJson = { campaignId?: string; droppedText?: string[]; error?: string };

function StepCheck({
  draft, selected, previewName, onBack,
}: {
  draft: CampaignDraft;
  selected: Set<string>;
  previewName: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { budgets, loadError, selected: number, selectedId, select } = useSalesBudget();
  const { message, followupHours, setFollowupHours } = draft;
  const [started, setStarted] = useState(false);
  const count = selected.size;

  const { run, pending } = useAsyncAction(async () => {
    if (!number) return;
    let res: Response;
    try {
      res = await fetch("/api/sales/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageTemplate: message,
          contactIds: Array.from(selected),
          numberId: number.number.id,
          followupInHours: followupHours,
        }),
      });
    } catch {
      toast.error("We couldn't reach the server. Check your connection and try again.");
      return;
    }
    const body = (await res.json().catch(() => null)) as CreateCampaignJson | null;
    if (!res.ok || !body?.campaignId) {
      toast.error(body?.error ?? "Could not start this campaign.");
      return;
    }
    setStarted(true);
    for (const line of body.droppedText ?? []) toast.warning(line);
    router.push(`/dashboard/sales/campaigns/${body.campaignId}`);
  });

  const loading = budgets === null && !loadError;
  const remaining = number ? Math.max(0, number.budget.dailyCap - number.budget.dailyUsed) : null;
  const split = remaining === null ? null : splitTodayTomorrow(count, remaining);
  const warmingUp = number !== null && number.budget.dailyCap < DEFAULT_SETTINGS.daily_cap;
  const blocked = message.trim() === "" || message.length > MAX_MESSAGE_LENGTH || varietyBlocked(message, count);
  const canStart = number !== null && !blocked && !started;

  let note: React.ReactNode = null;
  if (loading) {
    note = <span role="status" aria-label="Checking your limits" className="text-xs text-pz-on-surface-variant">Checking your limits…</span>;
  } else if (budgets === null) {
    note = <span className="text-xs text-pz-danger">We couldn&apos;t check your limits. Refresh the page to try again.</span>;
  } else if (number === null) {
    note = (
      <span className="text-xs text-pz-on-surface-variant">
        No WhatsApp number yet. Ask your admin to give you one before you can start.
      </span>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      <div className="lg:col-span-7 flex flex-col gap-4 min-w-0">
        <section aria-label="Summary" className="bg-pz-surface-container-lowest p-4 md:p-6 rounded-xl shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 shrink-0 rounded-full bg-pz-primary-container/30 text-pz-on-primary-container flex items-center justify-center">
              <Users className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-headline font-bold text-pz-on-surface-variant">Sending to</span>
              <span className="text-xl font-headline font-bold text-pz-on-surface">{count} people</span>
            </div>
          </div>

          {split !== null && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-pz-tertiary-fixed/30 rounded-xl p-4 flex flex-col gap-1">
                <span className="text-base font-headline font-bold text-pz-on-surface">Today: {split.today}</span>
                <span className="text-xs text-pz-on-surface-variant">Within today&apos;s limit</span>
              </div>
              <div className="bg-pz-surface-container-low rounded-xl p-4 flex flex-col gap-1">
                <span className="text-base font-headline font-bold text-pz-on-surface">Tomorrow: {split.tomorrow}</span>
                <span className="text-xs text-pz-on-surface-variant">Wait for tomorrow</span>
              </div>
            </div>
          )}

          {budgets !== null && budgets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {budgets.length > 1 ? (
                <label className="flex flex-col gap-1 text-xs font-headline font-bold text-pz-on-surface-variant">
                  WhatsApp number
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => select(e.target.value)}
                    disabled={pending || started}
                    className={fieldCls}
                  >
                    {budgets.map((b) => (
                      <option key={b.number.id} value={b.number.id}>{b.number.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <span className="text-xs font-headline font-bold text-pz-on-surface-variant">Sending from</span>
                  <span className="text-sm font-headline font-bold text-pz-on-surface">{number?.number.label}</span>
                </>
              )}
              {warmingUp && number && (
                <p className="text-xs text-pz-on-surface-variant">
                  This number is warming up: {number.budget.dailyCap} new chats a day.
                </p>
              )}
            </div>
          )}

          <div role="group" aria-label="Bring them back in" className="flex flex-col gap-1.5">
            <span className="text-xs font-headline font-bold text-pz-on-surface-variant">Bring them back in</span>
            <div className="flex flex-wrap gap-2">
              {FOLLOWUP_CHOICES.map(({ hours, label }) => (
                <button
                  key={hours}
                  type="button"
                  aria-pressed={followupHours === hours}
                  disabled={pending || started}
                  onClick={() => setFollowupHours(hours)}
                  className={`min-h-11 px-3.5 py-2 rounded-lg text-xs font-headline font-semibold transition-colors disabled:opacity-50 ${
                    followupHours === hours ? "bg-pz-primary text-pz-on-primary" : "bg-pz-surface-container-low text-pz-on-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      <aside className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-24">
        <MessagePreview text={renderWhatsAppMessage(message, previewName)} />
        <div className={actionBarCls}>
          <div className="flex flex-col gap-2 max-w-lg mx-auto lg:max-w-none">
            {note}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onBack} disabled={pending || started} className={`${backBtnCls} disabled:opacity-50`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <Button
                type="button"
                variant="bare"
                size="bare"
                disabled={!canStart}
                loading={pending}
                onClick={() => void run()}
                className={`${startBtnCls} flex-1`}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Start sending
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
