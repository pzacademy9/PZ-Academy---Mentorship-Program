"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Pencil, Play, Plus, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { PromoCode } from "@/lib/landing/registration/promo";
import {
  PROMO_CURRENCIES, PROMO_STATE_LABEL, describeDiscount, draftFromPromo, draftToInput, emptyPromoDraft, normalizeCodeInput,
  optionChoices, patchFromInput, promoState, type PromoDraft, type PromoErrors, type PromoPageOption, type PromoStateKey,
} from "@/lib/landing/registration/promo-form";
import { CONTROL, HELP, LABEL } from "../registration/styles";

const ERROR = "block font-body text-xs font-medium text-pz-danger";
const CHECK_ROW = "flex items-center gap-2 font-body text-sm text-pz-on-surface max-md:min-h-11";
const STATE_CLASS: Record<PromoStateKey, string> = {
  active: "bg-pz-primary-container text-pz-on-primary-container",
  paused: "bg-pz-surface-container-high text-pz-on-surface-variant",
  scheduled: "bg-pz-secondary-container text-pz-on-secondary-container",
  expired: "bg-pz-surface-container-high text-pz-on-surface-variant",
  used_up: "bg-pz-error-container text-pz-on-error-container",
};

function formatPkt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
}
function datesText(p: PromoCode): string {
  if (p.startsAt && p.endsAt) return `${formatPkt(p.startsAt)} to ${formatPkt(p.endsAt)}`;
  if (p.endsAt) return `Until ${formatPkt(p.endsAt)}`;
  if (p.startsAt) return `From ${formatPkt(p.startsAt)}`;
  return "No end date";
}
function usesText(p: PromoCode): string {
  return p.maxUses === null ? `${p.usedCount} used` : `${p.usedCount} of ${p.maxUses} used`;
}
function whereText(p: PromoCode, pages: PromoPageOption[]): string {
  const where = p.pageIds.length === 0 ? "All pages" : p.pageIds.map((id) => pages.find((x) => x.id === id)?.title ?? "A deleted page").join(", ");
  if (p.optionKeys.length === 0) return where;
  const all = pages.flatMap((x) => x.options);
  return `${where} · only ${p.optionKeys.map((k) => all.find((o) => o.key === k)?.label ?? k).join(", ")}`;
}
const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
// Server field names (Task 13's `{ error, field }`) that have a place in this form.
const FORM_FIELDS = ["code", "value", "maxDiscountPercent", "fixedAmounts", "pageIds", "maxUses", "startsAt", "endsAt"] as const;

type Editing = { mode: "new" } | { mode: "edit"; promo: PromoCode } | null;

export function PromoCodesManager({ codes, pages }: { codes: PromoCode[]; pages: PromoPageOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const now = new Date();

  const { run: toggleActive, pendingKey } = useAsyncAction(async (p: PromoCode) => {
    try {
      const res = await fetch(`/api/admin/landing-promo-codes/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) { toast.error(body?.error ?? "Could not update the promo code."); return; }
      toast.success(p.active ? `${p.code} paused.` : `${p.code} is active again.`);
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  }, { getKey: (p) => p.id });

  const dialog = (
    <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
      {editing && (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing.mode === "edit" ? `Edit ${editing.promo.code}` : "New promo code"}</DialogTitle>
            <DialogDescription>The registration form checks the code on the server, so the discount is always exactly what you set here.</DialogDescription>
          </DialogHeader>
          <PromoForm key={editing.mode === "edit" ? editing.promo.id : "new"} existing={editing.mode === "edit" ? editing.promo : null} pages={pages} onDone={() => setEditing(null)} />
        </DialogContent>
      )}
    </Dialog>
  );

  if (codes.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-pz-outline-variant bg-pz-surface-container-lowest">
          <EmptyState
            icon={TicketPercent}
            title="No promo codes yet"
            description="Make a code like PZ10 for 10% off, for one page or for every page."
            action={{ label: "Create your first code", onClick: () => setEditing({ mode: "new" }) }}
          />
        </div>
        {dialog}
      </>
    );
  }

  const actions = (p: PromoCode) => (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${p.code}`} onClick={() => setEditing({ mode: "edit", promo: p })}>
        <Pencil aria-hidden="true" /> Edit
      </Button>
      <Button type="button" variant="ghost" size="sm" aria-label={`${p.active ? "Pause" : "Resume"} ${p.code}`} disabled={pendingKey === p.id} onClick={() => void toggleActive(p)}>
        {p.active ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {p.active ? "Pause" : "Resume"}
      </Button>
    </div>
  );
  const stateChip = (p: PromoCode) => {
    const s = promoState(p, now);
    return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 font-body text-xs font-semibold", STATE_CLASS[s])}>{PROMO_STATE_LABEL[s]}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing({ mode: "new" })}>
          <Plus aria-hidden="true" /> New promo code
        </Button>
      </div>

      {/* Phone: cards */}
      <ul className="space-y-3 md:hidden">
        {codes.map((p) => (
          <li key={p.id} className="space-y-2 rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-base font-bold text-pz-on-surface">{p.code}</span>
              {stateChip(p)}
            </div>
            <p className="font-body text-sm text-pz-on-surface">{describeDiscount(p)}</p>
            <p className={HELP}>{whereText(p, pages)}</p>
            <p className={HELP}>{`${usesText(p)} · ${datesText(p)}`}</p>
            {actions(p)}
          </li>
        ))}
      </ul>

      {/* Laptop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-pz-outline-variant bg-pz-surface-container-lowest md:block">
        <table aria-label="Promo codes" className="w-full text-left text-sm">
          <thead className="bg-pz-surface-container-high font-headline text-xs uppercase tracking-wide text-pz-on-surface-variant">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Code</th>
              <th scope="col" className="px-4 py-3 font-semibold">Discount</th>
              <th scope="col" className="px-4 py-3 font-semibold">Works on</th>
              <th scope="col" className="px-4 py-3 font-semibold">Uses</th>
              <th scope="col" className="px-4 py-3 font-semibold">Dates (Pakistan time)</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pz-outline-variant">
            {codes.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono font-bold text-pz-on-surface">{p.code}</td>
                <td className="px-4 py-3 text-pz-on-surface">{describeDiscount(p)}</td>
                <td className="px-4 py-3 text-pz-on-surface-variant">{whereText(p, pages)}</td>
                <td className="px-4 py-3 tabular-nums text-pz-on-surface-variant">{usesText(p)}</td>
                <td className="px-4 py-3 text-pz-on-surface-variant">{datesText(p)}</td>
                <td className="px-4 py-3">{stateChip(p)}</td>
                <td className="px-4 py-3">{actions(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog}
    </div>
  );
}

function PromoForm({ existing, pages, onDone }: { existing: PromoCode | null; pages: PromoPageOption[]; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<PromoDraft>(() => (existing ? draftFromPromo(existing) : emptyPromoDraft()));
  const [errors, setErrors] = useState<PromoErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const set = (patch: Partial<PromoDraft>) => setD((x) => ({ ...x, ...patch }));
  const choices = optionChoices(pages, d.scope === "pages" ? d.pageIds : []);

  // Keyboard and screen-reader users land on the first field that needs fixing.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const { run: save, pending } = useAsyncAction(async () => {
    const available = new Set(choices.map((c) => c.key));
    const checked = draftToInput({ ...d, optionKeys: d.optionKeys.filter((k) => available.has(k)) }, existing?.ownerAgentId ?? null);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    const code = checked.input.code;
    try {
      const res = await fetch(existing ? `/api/admin/landing-promo-codes/${existing.id}` : "/api/admin/landing-promo-codes", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing ? patchFromInput(checked.input) : checked.input),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; field?: string } | null;
      if (res.status === 409) { setErrors({ code: body?.error ?? `${code} already exists. Choose another code.` }); return; }
      const field = body?.field?.split(".")[0];
      if (res.status === 400 && body?.error && field && (FORM_FIELDS as readonly string[]).includes(field)) {
        setErrors({ [field]: body.error } as PromoErrors);
        return;
      }
      if (!res.ok) { toast.error(body?.error ?? "Could not save the promo code."); return; }
      toast.success(existing ? `${code} saved.` : `${code} created.`);
      router.refresh();
      onDone();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  const invalid = (k: keyof PromoErrors) => (errors[k] ? true : undefined);
  // Error and help text are tied to their field by id, so a screen reader reads them when the field is focused.
  const uid = useId();
  const errId = (k: keyof PromoErrors) => `${uid}-${k}-error`;
  const helpId = (k: keyof PromoErrors) => `${uid}-${k}-help`;
  const describedBy = (k: keyof PromoErrors, hasHelp: boolean) => {
    const ids = [errors[k] ? errId(k) : null, hasHelp ? helpId(k) : null].filter(Boolean).join(" ");
    return ids || undefined;
  };

  return (
    <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-5">
      <label className="block space-y-1">
        <span className={LABEL}>Code</span>
        <span id={helpId("code")} className={`block ${HELP}`}>
          {existing ? "Codes can't be renamed, because links people already have would stop working. Make a new code instead." : "What people type, for example PZ10. Capital letters, numbers, - and _ only."}
        </span>
        <input
          aria-label="Code" aria-invalid={invalid("code")} aria-describedby={describedBy("code", true)} readOnly={!!existing} maxLength={40} autoComplete="off"
          className={cn(CONTROL, "font-mono uppercase")} value={d.code} onChange={(e) => set({ code: normalizeCodeInput(e.target.value) })}
        />
        {errors.code && <span id={errId("code")} role="alert" className={ERROR}>{errors.code}</span>}
      </label>

      <fieldset className="space-y-2">
        <legend className={LABEL}>Discount</legend>
        <div className="flex flex-wrap gap-4">
          <label className={CHECK_ROW}><input type="radio" name="promo-type" checked={d.type === "percent"} onChange={() => set({ type: "percent" })} />Percentage off</label>
          <label className={CHECK_ROW}><input type="radio" name="promo-type" checked={d.type === "fixed"} onChange={() => set({ type: "fixed" })} />Fixed amount off</label>
        </div>
        {d.type === "percent" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={LABEL}>Percent off</span>
              <input aria-label="Percent off" aria-invalid={invalid("value")} aria-describedby={describedBy("value", false)} type="number" inputMode="numeric" min={1} max={100} className={CONTROL} value={d.value} onChange={(e) => set({ value: e.target.value })} />
              {errors.value && <span id={errId("value")} role="alert" className={ERROR}>{errors.value}</span>}
            </label>
            <label className="block space-y-1">
              <span className={LABEL}>Never more than (%)</span>
              <span id={helpId("maxDiscountPercent")} className={`block ${HELP}`}>Optional. Leave empty for no limit.</span>
              <input aria-label="Never more than (%)" aria-invalid={invalid("maxDiscountPercent")} aria-describedby={describedBy("maxDiscountPercent", true)} type="number" inputMode="numeric" min={0} max={100} className={CONTROL} value={d.maxDiscountPercent} onChange={(e) => set({ maxDiscountPercent: e.target.value })} />
              {errors.maxDiscountPercent && <span id={errId("maxDiscountPercent")} role="alert" className={ERROR}>{errors.maxDiscountPercent}</span>}
            </label>
          </div>
        ) : (
          <div className="space-y-1">
            <span id={helpId("fixedAmounts")} className={`block ${HELP}`}>Discount on the whole registration, in each currency. Leave a currency empty if the code should not work there.</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PROMO_CURRENCIES.map((c) => (
                <label key={c} className="block space-y-1">
                  <span className={LABEL}>{c}</span>
                  <input
                    aria-label={`Amount off in ${c}`} aria-invalid={invalid("fixedAmounts")} aria-describedby={describedBy("fixedAmounts", true)} type="number" inputMode="numeric" min={0} className={CONTROL}
                    value={d.fixedAmounts[c] ?? ""} onChange={(e) => set({ fixedAmounts: { ...d.fixedAmounts, [c]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            {errors.fixedAmounts && <span id={errId("fixedAmounts")} role="alert" className={ERROR}>{errors.fixedAmounts}</span>}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={LABEL}>Where it works</legend>
        <div className="flex flex-wrap gap-4">
          <label className={CHECK_ROW}><input type="radio" name="promo-scope" checked={d.scope === "all"} onChange={() => set({ scope: "all" })} />All pages</label>
          <label className={CHECK_ROW}><input type="radio" name="promo-scope" checked={d.scope === "pages"} onChange={() => set({ scope: "pages" })} />Only these pages</label>
        </div>
        {d.scope === "pages" && (
          <ul aria-label="Pages" aria-describedby={describedBy("pageIds", false)} className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-pz-outline-variant p-2">
            {pages.map((p) => (
              <li key={p.id}>
                <label className={CHECK_ROW}><input type="checkbox" checked={d.pageIds.includes(p.id)} onChange={() => set({ pageIds: toggleIn(d.pageIds, p.id) })} />{p.title}</label>
              </li>
            ))}
          </ul>
        )}
        {errors.pageIds && <span id={errId("pageIds")} role="alert" className={ERROR}>{errors.pageIds}</span>}
        {choices.length > 0 && (
          <div className="space-y-1">
            <span className={`block ${HELP}`}>Only for these options (optional). Leave all unticked for every option.</span>
            <ul aria-label="Options" className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-pz-outline-variant p-2">
              {choices.map((c) => (
                <li key={c.key}>
                  <label className={CHECK_ROW}><input type="checkbox" checked={d.optionKeys.includes(c.key)} onChange={() => set({ optionKeys: toggleIn(d.optionKeys, c.key) })} />{c.label}</label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={LABEL}>Limits</legend>
        <label className="block space-y-1 sm:max-w-xs">
          <span className={LABEL}>Total uses (optional)</span>
          <span id={helpId("maxUses")} className={`block ${HELP}`}>Each registration counts once, whatever the group size. Test registrations never count.</span>
          <input aria-label="Total uses" aria-invalid={invalid("maxUses")} aria-describedby={describedBy("maxUses", true)} type="number" inputMode="numeric" min={1} className={CONTROL} value={d.maxUses} onChange={(e) => set({ maxUses: e.target.value })} />
          {errors.maxUses && <span id={errId("maxUses")} role="alert" className={ERROR}>{errors.maxUses}</span>}
        </label>
        <label className={CHECK_ROW}><input type="checkbox" checked={d.oneperEmail} onChange={(e) => set({ oneperEmail: e.target.checked })} />One use per email address</label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={LABEL}>Dates (Pakistan time)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={LABEL}>Starts</span>
            <input aria-label="Starts" aria-invalid={invalid("startsAt")} aria-describedby={describedBy("startsAt", false)} type="datetime-local" className={CONTROL} value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            {errors.startsAt && <span id={errId("startsAt")} role="alert" className={ERROR}>{errors.startsAt}</span>}
          </label>
          <label className="block space-y-1">
            <span className={LABEL}>Ends</span>
            <input aria-label="Ends" aria-invalid={invalid("endsAt")} aria-describedby={describedBy("endsAt", false)} type="datetime-local" className={CONTROL} value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            {errors.endsAt && <span id={errId("endsAt")} role="alert" className={ERROR}>{errors.endsAt}</span>}
          </label>
        </div>
        <p className={HELP}>Leave both empty for a code that works until you pause it.</p>
      </fieldset>

      <label className={CHECK_ROW}><input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />Code is active</label>

      <div className="flex justify-end gap-2 border-t border-pz-outline-variant pt-3">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : existing ? "Save changes" : "Create code"}
        </Button>
      </div>
    </form>
  );
}
