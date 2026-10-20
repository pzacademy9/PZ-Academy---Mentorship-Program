// src/components/admin/landing/registration/RegistrationSetup.tsx
"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseModule } from "@/lib/data/landing-course-modules";
import type { PaymentAccount } from "@/lib/data/landing-payment-accounts";
import { FIELD_MAX, MAX_CAPACITY, MAX_GROUP_SIZE, registrationProblems, type Mode, type RegistrationConfig } from "@/lib/landing/registration/config";
import { isValidWaGroupUrl } from "@/lib/landing/registration/wa-groups";
import { REG_STEPS, type RegistrationStepKey } from "@/lib/landing/registration/setup-steps";
import {
  TIER_PRESETS, TZ_CHOICES, addOption, addTier, localToOffsetIso, offsetIsoToLocal, removeOption, removeTier,
  toggleAccount, updateOption, updateTier,
} from "@/lib/landing/registration/admin-edit";
import { PricesStep } from "./PricesStep";
import { WaTestLinkButton } from "./WaTestLinkButton";
import { CONTROL, HELP, ICON_BTN, LABEL } from "./styles";

export type PaymentAccountSummary = Pick<PaymentAccount, "key" | "label" | "kind" | "displayText">;

const CARD = "space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4";
const ERROR = "font-body text-xs font-medium text-pz-danger";
const WARN = "flex items-start gap-2 rounded-lg border border-pz-warning/40 bg-pz-warning/10 p-2 font-body text-xs text-pz-on-surface";
const TEXT_BTN = "inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-2 font-body text-sm font-semibold text-pz-on-surface hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11";

const WARN_WINDOW_MS = 48 * 3600_000;

/** "past" when the Early Bird end is already behind us, "soon" within ~48h, else null. */
export function earlyBirdUrgency(iso: string, now: number): "past" | "soon" | null {
  const t = Date.parse(iso);
  if (iso.trim() === "" || Number.isNaN(t)) return null;
  if (t <= now) return "past";
  return t - now <= WARN_WINDOW_MS ? "soon" : null;
}

const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
const whole = (v: string, min = 0, max = Number.MAX_SAFE_INTEGER) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min; };

export function RegistrationSetup({
  registration: r, accounts, step, onStep, onChange, courseModules, saveMessage,
}: {
  registration: RegistrationConfig;
  accounts: PaymentAccountSummary[];
  step: RegistrationStepKey;
  onStep: (s: RegistrationStepKey) => void;
  onChange: (next: RegistrationConfig) => void;
  /** The page's course modules, in course order. null or left out = no course, so no module row. */
  courseModules?: CourseModule[] | null;
  /** The server's message when it refused the last save. */
  saveMessage?: string | null;
}) {
  const problems = r.enabled ? registrationProblems(r) : [];
  const [now] = useState(() => Date.now());
  const urgency = earlyBirdUrgency(r.earlyBirdEndsAt, now);
  const index = REG_STEPS.findIndex((s) => s.key === step);
  const current = REG_STEPS[index] ?? REG_STEPS[0];

  return (
    <section aria-labelledby="reg-setup-h" className="space-y-4">
      <div className={cn(CARD, "flex items-start justify-between gap-3")}>
        <div>
          <h3 id="reg-setup-h" className="font-headline text-sm font-bold text-pz-on-surface">Registration form</h3>
          <p className={HELP}>People register and pay on this page. Turn off to send the Register button to a link instead.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={r.enabled}
          aria-label="Use the built-in registration form"
          onClick={() => onChange({ ...r, enabled: !r.enabled })}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", r.enabled ? "bg-pz-solid-forest" : "bg-pz-outline-variant")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-pz-surface-container-lowest shadow transition-transform", r.enabled ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </div>

      <nav aria-label="Registration setup steps">
        <ol className="flex flex-wrap gap-1.5">
          {REG_STEPS.map((s, i) => {
            const count = problems.filter((p) => p.step === s.key).length;
            const active = s.key === current.key;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  aria-label={count > 0 ? `${i + 1} ${s.label} ${count} ${count === 1 ? "problem" : "problems"}` : undefined}
                  aria-current={active ? "step" : undefined}
                  onClick={() => onStep(s.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11",
                    active ? "border-pz-solid-forest bg-pz-solid-forest text-white" : "border-pz-outline-variant text-pz-on-surface hover:bg-pz-surface-container-high",
                  )}
                >
                  <span>{i + 1} {s.label}</span>
                  {count > 0 && <span aria-hidden="true" className="rounded-full bg-pz-warning px-1.5 text-[10px] font-bold text-pz-on-surface">{count}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {urgency && (
        <div role="status" className={WARN}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-pz-warning" aria-hidden="true" />
          <p className="flex-1">
            {urgency === "past"
              ? "The Early Bird end time has already passed, so Early Bird prices are no longer offered. Set a new end time, or clear it."
              : "Early Bird ends in less than 48 hours. Check the end time is what you want."}
          </p>
          {current.key !== "earlybird" && (
            <button type="button" className="shrink-0 font-semibold text-pz-primary underline-offset-2 hover:underline" onClick={() => onStep("earlybird")}>
              Review Early Bird
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-headline text-base font-bold text-pz-on-surface">{current.label}</h3>
        {current.key === "buy" && <BuyStep r={r} onChange={onChange} courseModules={courseModules ?? null} />}
        {current.key === "groups" && <GroupsStep r={r} onChange={onChange} />}
        {current.key === "prices" && <PricesStep r={r} onChange={onChange} />}
        {current.key === "earlybird" && <EarlyBirdStep r={r} onChange={onChange} />}
        {current.key === "accounts" && <AccountsStep r={r} accounts={accounts} onChange={onChange} />}
        {current.key === "promo" && <PromoStep />}
        {current.key === "whatsapp" && <WhatsAppStep r={r} onChange={onChange} />}
        {current.key === "details" && <DetailsStep r={r} onChange={onChange} />}
      </div>

      {saveMessage && <p role="alert" className={ERROR}>{saveMessage}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-pz-outline-variant pt-3">
        <button type="button" className={TEXT_BTN} disabled={index <= 0} onClick={() => onStep(REG_STEPS[Math.max(0, index - 1)].key)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <button type="button" className={TEXT_BTN} disabled={index >= REG_STEPS.length - 1} onClick={() => onStep(REG_STEPS[Math.min(REG_STEPS.length - 1, index + 1)].key)}>
          Next step <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function BuyStep({ r, onChange, courseModules }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void; courseModules: CourseModule[] | null }) {
  const ordered = courseModules ? [...courseModules].sort((a, b) => a.order_index - b.order_index) : null;
  const toggleMode = (m: Mode) => onChange({ ...r, modes: r.modes.includes(m) ? r.modes.filter((x) => x !== m) : [...r.modes, m] });
  const bundles = r.options.filter((o) => o.kind === "bundle");
  return (
    <div className="space-y-4">
      <fieldset className={CARD}>
        <legend className={LABEL}>How people take part</legend>
        <label className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
          <input type="checkbox" checked={r.modes.includes("live")} onChange={() => toggleMode("live")} /> Live sessions
        </label>
        <label className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
          <input type="checkbox" checked={r.modes.includes("recorded")} onChange={() => toggleMode("recorded")} /> Recorded lectures
        </label>
        {r.modes.includes("recorded") && (
          <label className="block space-y-1">
            <span className={LABEL}>Recorded price, % of the regular price</span>
            <span className={`block ${HELP}`}>85 means recorded costs 85% of the regular (not Early Bird) price. 100 means the same price.</span>
            <input type="number" inputMode="numeric" min={1} max={100} aria-label="Recorded price, % of the regular price" className={`${CONTROL} w-28`} value={String(r.recordedPercentOfRegular)} onChange={(e) => onChange({ ...r, recordedPercentOfRegular: Math.min(100, whole(e.target.value, 1)) })} />
          </label>
        )}
      </fieldset>

      <section className={CARD} aria-label="Options people can buy">
        <p className={HELP}>A package is chosen on its own (for example Full Course, or Free / Pro). Modules can be combined.</p>
        <ul className="space-y-2">
          {r.options.map((o, i) => (
            <li key={o.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3 lg:grid-cols-[1.6fr_1fr_auto_auto]">
              <input aria-label={`Option ${i + 1} name`} maxLength={FIELD_MAX.optionLabel} className={CONTROL} value={o.label} onChange={(e) => onChange(updateOption(r, o.key, { label: e.target.value }))} />
              <select aria-label={`Option ${i + 1} type`} className={CONTROL} value={o.kind} onChange={(e) => onChange(updateOption(r, o.key, { kind: e.target.value as "bundle" | "module" }))}>
                <option value="bundle">Whole package</option>
                <option value="module">Single module</option>
              </select>
              <label className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
                <input type="checkbox" aria-label={`${o.label || `Option ${i + 1}`}: free (no payment)`} checked={o.free} onChange={(e) => onChange(updateOption(r, o.key, { free: e.target.checked }))} /> Free (no payment)
              </label>
              <button type="button" aria-label={`Remove option ${i + 1}`} className={ICON_BTN} onClick={() => onChange(removeOption(r, o.key))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
              {ordered && ordered.length > 0 && (
                <fieldset aria-label={`Modules ${o.label || `Option ${i + 1}`} gives`} className="col-span-full min-w-0 space-y-1.5 border-t border-pz-outline-variant pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-2">
                    <span className="font-headline text-[11px] font-bold text-pz-on-surface">Modules this option gives</span>
                    <span className="font-label text-[10px] text-pz-on-surface-variant">Nothing ticked = the whole course</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {ordered.map((m) => {
                      const on = o.moduleIds.includes(m.id);
                      return (
                        <label key={m.id} className={cn("flex cursor-pointer items-center gap-1.5", on ? "text-pz-on-surface" : "text-pz-on-surface-variant")}>
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-pz-outline-variant accent-pz-solid-forest"
                            aria-label={`${o.label || `Option ${i + 1}`}: ${m.title}`}
                            checked={on}
                            onChange={() => onChange(updateOption(r, o.key, { moduleIds: on ? o.moduleIds.filter((x) => x !== m.id) : [...o.moduleIds, m.id] }))}
                          />
                          <span>{m.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={TEXT_BTN} onClick={() => onChange(addOption(r, "bundle", "New package"))}><Plus className="h-4 w-4" aria-hidden="true" /> Add a package</button>
          <button type="button" className={TEXT_BTN} onClick={() => onChange(addOption(r, "module", "New module"))}><Plus className="h-4 w-4" aria-hidden="true" /> Add a module</button>
        </div>
        {bundles.length > 0 && r.options.some((o) => o.kind === "module") && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
              <input type="checkbox" checked={r.moduleMix.enabled} onChange={(e) => onChange({ ...r, moduleMix: { enabled: e.target.checked, bundleOptionKey: r.moduleMix.bundleOptionKey || bundles[0].key } })} />
              Choosing every module switches to the package
            </label>
            {r.moduleMix.enabled && (
              <select aria-label="Package to switch to" className={`${CONTROL} w-auto`} value={r.moduleMix.bundleOptionKey} onChange={(e) => onChange({ ...r, moduleMix: { enabled: true, bundleOptionKey: e.target.value } })}>
                {bundles.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function GroupsStep({ r, onChange }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void }) {
  const presets = TIER_PRESETS.filter((p) => !r.tiers.some((t) => t.key === p.key));
  return (
    <div className="space-y-3">
      <p className={HELP}>Individual (one person, full price) is always offered. Add group sizes with a discount per person. Groups are not offered for free options.</p>
      <ul className="space-y-2">
        {r.tiers.map((t) => (
          <li key={t.key} className="grid grid-cols-2 gap-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-3 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_auto]">
            <input aria-label={`Name for ${t.label}`} maxLength={FIELD_MAX.name} className={CONTROL} value={t.label} onChange={(e) => onChange(updateTier(r, t.key, { label: e.target.value }))} />
            <input type="number" inputMode="numeric" aria-label={`Smallest size for ${t.label}`} className={CONTROL} value={String(t.minSize)} onChange={(e) => onChange(updateTier(r, t.key, { minSize: whole(e.target.value, 2, MAX_GROUP_SIZE) }))} />
            <input type="number" inputMode="numeric" aria-label={`Largest size for ${t.label}`} className={CONTROL} value={String(t.maxSize)} onChange={(e) => onChange(updateTier(r, t.key, { maxSize: whole(e.target.value, 2, MAX_GROUP_SIZE) }))} />
            <input type="number" inputMode="numeric" aria-label={`Percent off for ${t.label}`} className={CONTROL} value={String(t.percentOff)} onChange={(e) => onChange(updateTier(r, t.key, { percentOff: Math.min(90, whole(e.target.value)) }))} />
            <button type="button" aria-label={`Remove group ${t.label}`} className={ICON_BTN} onClick={() => onChange(removeTier(r, t.key))}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.key} type="button" className={TEXT_BTN} onClick={() => onChange(addTier(r, p))}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add {p.label} ({p.percentOff}% off)
          </button>
        ))}
      </div>
    </div>
  );
}

/** "+05:30" -> milliseconds east of UTC. */
function offsetMs(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 0;
}

function EarlyBirdStep({ r, onChange }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void }) {
  const parsed = offsetIsoToLocal(r.earlyBirdEndsAt);
  // The zone picked before any date is set must survive until the date is typed.
  const [pickedOffset, setPickedOffset] = useState(parsed.offset);
  const { local } = parsed;
  const offset = r.earlyBirdEndsAt ? parsed.offset : pickedOffset;
  const t = Date.parse(r.earlyBirdEndsAt);
  const preview = Number.isNaN(t)
    ? null
    : `Ends ${new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(t + offsetMs(offset))} (UTC${offset}), which is ${new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Karachi" }).format(t)} Pakistan time`;
  const choices = TZ_CHOICES.some((c) => c.offset === offset) ? TZ_CHOICES : [...TZ_CHOICES, { label: `UTC${offset}`, offset }];
  return (
    <div className={CARD}>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-1">
          <span className={LABEL}>Early Bird ends</span>
          <input type="datetime-local" aria-label="Early Bird ends" className={CONTROL} value={local} onChange={(e) => onChange({ ...r, earlyBirdEndsAt: localToOffsetIso(e.target.value, offset) })} />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Time zone</span>
          <select aria-label="Time zone" className={CONTROL} value={offset} onChange={(e) => {
            setPickedOffset(e.target.value);
            // Keep the same instant: only the way it is entered and shown changes.
            if (Number.isNaN(t)) return;
            const shifted = new Date(t + offsetMs(e.target.value)).toISOString().slice(0, 16);
            onChange({ ...r, earlyBirdEndsAt: localToOffsetIso(shifted, e.target.value) });
          }}>
            {choices.map((c) => <option key={c.offset} value={c.offset}>{c.label}</option>)}
          </select>
        </label>
      </div>
      {preview && <p className="font-body text-sm text-pz-on-surface">{preview}</p>}
      <p className={HELP}>Early Bird ends at this exact moment for everyone, wherever they are. Leave it empty for no Early Bird.</p>
      {r.earlyBirdEndsAt && (
        <button type="button" className="font-body text-sm font-semibold text-pz-primary underline-offset-2 hover:underline" onClick={() => onChange({ ...r, earlyBirdEndsAt: "" })}>
          Clear Early Bird
        </button>
      )}
    </div>
  );
}

function AccountsStep({ r, accounts, onChange }: { r: RegistrationConfig; accounts: PaymentAccountSummary[]; onChange: (n: RegistrationConfig) => void }) {
  return (
    <div className="space-y-3">
      <p className={HELP}>Accounts are shared by every page. Visitors only see the accounts ticked for their country. To change an account number, ask a developer (the accounts screen comes later).</p>
      {r.regions.length === 0 && <p className={HELP}>Add a country in &quot;Prices by country&quot; first.</p>}
      {r.regions.map((g) => (
        <fieldset key={g.key} className={CARD} aria-label={g.label}>
          <legend className={LABEL}>{g.label}</legend>
          <ul className="space-y-1.5">
            {accounts.map((a) => (
              <li key={a.key}>
                <label className="flex items-start gap-2 font-body text-sm text-pz-on-surface">
                  <input type="checkbox" className="mt-1" checked={g.accountKeys.includes(a.key)} onChange={() => onChange(toggleAccount(r, g.key, a.key))} />
                  <span>
                    <span className="block font-semibold">{a.label}</span>
                    <span className={HELP}>{a.displayText}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

function PromoStep() {
  return (
    <div className={CARD}>
      <p className="font-body text-sm text-pz-on-surface">Promo codes are made once and can work on one page or on all pages. The server checks every code, so a made-up code never gives a discount.</p>
      <Link href="/dashboard/admin/landing-promo-codes" target="_blank" className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-pz-primary underline-offset-2 hover:underline">
        Open promo codes <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function WaRow({ r, o, onChange }: { r: RegistrationConfig; o: RegistrationConfig["options"][number]; onChange: (n: RegistrationConfig) => void }) {
  const id = useId();
  const bad = o.waGroupUrl !== "" && !isValidWaGroupUrl(o.waGroupUrl);
  const missing = o.waGroupUrl === "";
  const describedBy = bad ? `${id}-bad` : missing ? `${id}-missing` : undefined;
  return (
    <li className="space-y-1.5">
      <label className="block space-y-1">
        <span className={LABEL}>{`WhatsApp group link for ${o.label}`}</span>
        <div className="flex gap-2">
          <input type="url" aria-label={`WhatsApp group link for ${o.label}`} aria-invalid={bad || undefined} aria-describedby={describedBy} maxLength={FIELD_MAX.waUrl} placeholder="https://chat.whatsapp.com/…" className={CONTROL} value={o.waGroupUrl} onChange={(e) => onChange(updateOption(r, o.key, { waGroupUrl: e.target.value.trim() }))} />
          <WaTestLinkButton url={o.waGroupUrl} />
        </div>
      </label>
      {bad && <p id={`${id}-bad`} role="alert" className={ERROR}>Paste a WhatsApp group invite link, like https://chat.whatsapp.com/AbC123</p>}
      {missing && (
        <p id={`${id}-missing`} className={WARN}><AlertTriangle className="h-4 w-4 shrink-0 text-pz-warning" aria-hidden="true" />{`No group link: people who choose ${o.label} won't see a Join button.`}</p>
      )}
    </li>
  );
}

function WhatsAppStep({ r, onChange }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void }) {
  return (
    <div className="space-y-3">
      <p className={HELP}>People see a Join button for the group of what they chose. Several modules show each module&apos;s group; every module or the package shows only the package&apos;s group. Recorded lectures show no group.</p>
      <ul className="space-y-3">
        {r.options.map((o) => (
          <WaRow key={o.key} r={r} o={o} onChange={onChange} />
        ))}
      </ul>
      <p className={WARN}><AlertTriangle className="h-4 w-4 shrink-0 text-pz-warning" aria-hidden="true" />In WhatsApp, open each group&apos;s settings and turn on Approve new members, so only people you have verified can join.</p>
      <label className="block space-y-1">
        <span className={LABEL}>WhatsApp number for payment checks</span>
        <span className={`block ${HELP}`}>Digits only, with country code, for example 923700199429. The success screen&apos;s &quot;Message us on WhatsApp&quot; button opens a chat with this number.</span>
        <input inputMode="numeric" aria-label="WhatsApp number for payment checks" maxLength={FIELD_MAX.waNumber} className={CONTROL} value={r.whatsappVerifyNumber} onChange={(e) => onChange({ ...r, whatsappVerifyNumber: e.target.value.replace(/\D/g, "") })} />
      </label>
    </div>
  );
}

function DetailsStep({ r, onChange }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void }) {
  return (
    <div className={cn(CARD, "space-y-4")}>
      <label className="block space-y-1">
        <span className={LABEL}>Event name in messages</span>
        <input aria-label="Event name in messages" maxLength={FIELD_MAX.name} placeholder="PPC Batch 3" className={CONTROL} value={r.eventLabel} onChange={(e) => onChange({ ...r, eventLabel: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className={LABEL}>Reference prefix</span>
        <span className={`block ${HELP}`}>2 to 6 capital letters or digits. Every registration gets a reference like the one shown.</span>
        <div className="flex items-center gap-2">
          <input aria-label="Reference prefix" maxLength={6} className={`${CONTROL} w-32`} value={r.refPrefix} onChange={(e) => onChange({ ...r, refPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          <span className="rounded-full bg-pz-surface-container-high px-2.5 py-1 font-mono text-xs text-pz-on-surface">{`PZA-${r.refPrefix || "XXX"}-001`}</span>
        </div>
      </label>
      <label className="block space-y-1">
        <span className={LABEL}>Success screen title</span>
        <input aria-label="Success screen title" maxLength={FIELD_MAX.name} placeholder="You're registered!" className={CONTROL} value={r.successTitle} onChange={(e) => onChange({ ...r, successTitle: e.target.value })} />
      </label>
      <label className="block space-y-1">
        <span className={LABEL}>Seat limit</span>
        <span className={`block ${HELP}`}>Counts every person, group members included. 0 means no limit.</span>
        <input type="number" inputMode="numeric" min={0} aria-label="Seat limit" className={`${CONTROL} w-28`} value={String(r.capacity)} onChange={(e) => onChange({ ...r, capacity: whole(e.target.value, 0, MAX_CAPACITY) })} />
      </label>
      <LinesField label="Professions" help="One per line." value={r.professions} onChange={(v) => onChange({ ...r, professions: v })} />
      <LinesField label="How did you hear about us? choices" help="One per line. Leave empty to hide the question." value={r.discoveryOptions} onChange={(v) => onChange({ ...r, discoveryOptions: v })} />
      <label className="block space-y-1">
        <span className={LABEL}>Meta Pixel ID (optional)</span>
        <span className={`block ${HELP}`}>Leave empty to use the academy&apos;s main Pixel.</span>
        <input inputMode="numeric" aria-label="Meta Pixel ID (optional)" maxLength={FIELD_MAX.pixel} className={CONTROL} value={r.pixelId} onChange={(e) => onChange({ ...r, pixelId: e.target.value.replace(/\D/g, "") })} />
      </label>
    </div>
  );
}

function LinesField({ label, help, value, onChange }: { label: string; help: string; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    if (lines(text).join("\n") !== value.join("\n")) setText(value.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block space-y-1">
      <span className={LABEL}>{label}</span>
      <span className={`block ${HELP}`}>{help}</span>
      <textarea aria-label={label} rows={4} className={CONTROL} value={text} onChange={(e) => { setText(e.target.value); onChange(lines(e.target.value).slice(0, FIELD_MAX.listCount).map((l) => l.slice(0, FIELD_MAX.listItem))); }} />
    </label>
  );
}
