"use client";

import { useState } from "react";
import { affiliateApplicationSchema, HOURS } from "@/lib/validations/affiliate-application";

type YesNo = { yes: boolean; details: string };
type Ratings = { marketing: number; eventPromotion: number; onlineEngagement: number; communication: number };

const INPUT =
  "w-full rounded-lg border border-landing-border bg-white px-3 py-2.5 text-base text-landing-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-primary";
const LABEL = "mb-1 block text-sm font-semibold text-landing-deep";
const ERR = "mt-1 text-sm font-medium text-landing-error";

const RATING_ROWS: { key: keyof Ratings; label: string }[] = [
  { key: "marketing", label: "Marketing" },
  { key: "eventPromotion", label: "Promoting events" },
  { key: "onlineEngagement", label: "Online engagement" },
  { key: "communication", label: "Communication" },
];

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      {error ? <p role="alert" className={ERR}>{error}</p> : null}
    </div>
  );
}

function YesNoField({ name, label, value, onChange, withDetails, error }: { name: string; label: string; value: YesNo; onChange: (v: YesNo) => void; withDetails?: boolean; error?: string }) {
  return (
    <fieldset>
      <legend className={LABEL}>{label}</legend>
      <div className="flex gap-6">
        {([true, false] as const).map((yes) => (
          <label key={String(yes)} className="flex items-center gap-2 text-base text-landing-on-surface">
            <input type="radio" name={name} checked={value.yes === yes} onChange={() => onChange({ ...value, yes })} />
            {yes ? "Yes" : "No"}
          </label>
        ))}
      </div>
      {withDetails && value.yes ? (
        <textarea
          aria-label={`${label} Details`}
          rows={2}
          maxLength={600}
          value={value.details}
          onChange={(e) => onChange({ ...value, details: e.target.value })}
          placeholder="A few words of detail"
          className={`${INPUT} mt-2`}
        />
      ) : null}
      {error ? <p role="alert" className={ERR}>{error}</p> : null}
    </fieldset>
  );
}

/** The public affiliate application form. */
export function ApplyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<"student" | "professional">("student");
  const [organization, setOrganization] = useState("");
  const [field, setField] = useState("");
  const [commissionExperience, setCommissionExperience] = useState<YesNo>({ yes: false, details: "" });
  const [eventsManaged, setEventsManaged] = useState<YesNo>({ yes: false, details: "" });
  const [promotingPrograms, setPromotingPrograms] = useState(false);
  const [onlineSales, setOnlineSales] = useState(false);
  const [ratings, setRatings] = useState<Ratings>({ marketing: 3, eventPromotion: 3, onlineEngagement: 3, communication: 3 });
  const [hoursPerWeek, setHoursPerWeek] = useState<(typeof HOURS)[number]>("4-6");
  const [linkedin, setLinkedin] = useState("");
  const [why, setWhy] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setFormError("");
    const payload = {
      name, email, whatsapp, city, country, status, organization, field,
      commissionExperience, eventsManaged, promotingPrograms, onlineSales,
      ratings, hoursPerWeek, linkedin, why, agreeTerms: agree, website,
    };
    const parsed = affiliateApplicationSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? "form");
        if (!next[k]) next[k] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const res = await fetch("/api/affiliates/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) setDone(true);
      else setFormError(data?.error ?? "Could not send your application. Please try again.");
    } catch {
      setFormError("Could not send your application. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-landing-border bg-white p-8 text-center">
        <h2 className="font-headline text-2xl font-extrabold text-landing-deep">Thanks, we have your application</h2>
        <p className="mt-3 text-base text-landing-on-surface">We review every application. If you are accepted, your affiliate code and private link are sent to your email.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <span className="inline-block rounded-full bg-landing-mint-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-landing-deep">Affiliate Programme</span>
        <h1 className="font-headline text-3xl font-extrabold text-landing-deep md:text-4xl">Join our affiliate team</h1>
        <p className="text-base text-landing-on-surface md:text-lg">Earn commission when students you refer pay for a course.</p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Commission", "8% to 10% of what your student pays, once payment is confirmed"],
          ["Your code", "Students get 10% off with your code"],
          ["Minimum payout", "PKR 3,500, paid by JazzCash, Easypaisa or bank"],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border border-landing-border bg-white p-4">
            <p className="font-headline text-sm font-bold text-landing-deep">{t}</p>
            <p className="mt-1 text-sm text-landing-on-surface">{d}</p>
          </div>
        ))}
      </div>

      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6 rounded-2xl border border-landing-border bg-white p-5 md:p-8">
        <section className="space-y-4">
          <h2 className="font-headline text-lg font-bold text-landing-deep">About you</h2>
          <Field id="aff-name" label="Full name" error={errors.name}>
            <input id="aff-name" className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </Field>
          <Field id="aff-email" label="Email" error={errors.email}>
            <input id="aff-email" type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} />
          </Field>
          <Field id="aff-wa" label="WhatsApp number" error={errors.whatsapp}>
            <input id="aff-wa" type="tel" className={INPUT} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} autoComplete="tel" maxLength={40} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="aff-city" label="City" error={errors.city}>
              <input id="aff-city" className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
            </Field>
            <Field id="aff-country" label="Country" error={errors.country}>
              <input id="aff-country" className={INPUT} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
            </Field>
          </div>
          <fieldset>
            <legend className={LABEL}>I am a</legend>
            <div className="flex gap-6">
              {(["student", "professional"] as const).map((s) => (
                <label key={s} className="flex items-center gap-2 text-base text-landing-on-surface">
                  <input type="radio" name="aff-status" checked={status === s} onChange={() => setStatus(s)} />
                  {s === "student" ? "Student" : "Professional"}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="aff-org" label="School, university or workplace" error={errors.organization}>
            <input id="aff-org" className={INPUT} value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} />
          </Field>
          <Field id="aff-field" label="Field of study or work" error={errors.field}>
            <input id="aff-field" className={INPUT} value={field} onChange={(e) => setField(e.target.value)} maxLength={120} />
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="font-headline text-lg font-bold text-landing-deep">Your experience</h2>
          <YesNoField name="aff-commission" label="Have you earned commission before?" value={commissionExperience} onChange={setCommissionExperience} withDetails error={errors.commissionExperience} />
          <YesNoField name="aff-events" label="Have you managed or promoted events?" value={eventsManaged} onChange={setEventsManaged} withDetails error={errors.eventsManaged} />
          <YesNoField name="aff-programs" label="Have you promoted courses or programs?" value={{ yes: promotingPrograms, details: "" }} onChange={(v) => setPromotingPrograms(v.yes)} />
          <YesNoField name="aff-sales" label="Have you sold anything online?" value={{ yes: onlineSales, details: "" }} onChange={(v) => setOnlineSales(v.yes)} />
          <fieldset className="space-y-2">
            <legend className={LABEL}>Rate yourself from 1 (new to this) to 5 (very strong)</legend>
            {RATING_ROWS.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <label htmlFor={`aff-r-${r.key}`} className="text-base text-landing-on-surface">{r.label}</label>
                <select id={`aff-r-${r.key}`} className="rounded-lg border border-landing-border bg-white px-3 py-2 text-base" value={ratings[r.key]} onChange={(e) => setRatings({ ...ratings, [r.key]: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </fieldset>
          <Field id="aff-hours" label="Hours per week you can give" error={errors.hoursPerWeek}>
            <select id="aff-hours" className={INPUT} value={hoursPerWeek} onChange={(e) => setHoursPerWeek(e.target.value as (typeof HOURS)[number])}>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
          <Field id="aff-linkedin" label="LinkedIn link (optional)" error={errors.linkedin}>
            <input id="aff-linkedin" type="url" className={INPUT} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} maxLength={200} placeholder="https://" />
          </Field>
          <Field id="aff-why" label="Why do you want to join?" error={errors.why}>
            <textarea id="aff-why" rows={4} maxLength={1000} className={INPUT} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
        </section>

        <p className="text-sm text-landing-on-surface">We use this only to review your application and contact you.</p>

        {/* Honeypot: hidden from people, bots fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm text-landing-on-surface">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I have read and agree to the{" "}
              <a href="/affiliate-apply/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-landing-primary underline">Affiliate Terms</a>,{" "}
              <a href="/affiliate-apply/rules" target="_blank" rel="noopener noreferrer" className="font-semibold text-landing-primary underline">Affiliate Rules</a> and{" "}
              <a href="/affiliate-apply/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-landing-primary underline">Privacy Policy</a>
            </span>
          </label>
          {errors.agreeTerms ? <p role="alert" className={ERR}>{errors.agreeTerms}</p> : null}
        </div>

        {formError ? <p role="alert" className={ERR}>{formError}</p> : null}

        <button type="submit" disabled={sending} className="w-full rounded-xl bg-pz-solid-forest px-5 py-3 font-headline text-base font-bold text-white disabled:opacity-60">
          {sending ? "Sending..." : "Submit application"}
        </button>
        <p className="text-center text-sm text-landing-on-surface">We review every application. If you are accepted, your affiliate code and private link are sent to your email.</p>
      </form>
    </div>
  );
}
