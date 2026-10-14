"use client";

import type { FieldErrors, FormState, LeadDraft, PersonDraft } from "@/lib/landing/registration/form-state";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { ConsentField, SelectField, TextField } from "./Field";
import { R_BTN_SECONDARY, R_CARD } from "./ui";

export function StepDetails({
  config, state, errors, isFree, onLead, onMember, onExpand, onConsent, onHoneypot,
}: {
  config: RegistrationConfig; state: FormState; errors: FieldErrors; isFree: boolean;
  onLead: (patch: Partial<LeadDraft>) => void; onMember: (i: number, patch: Partial<PersonDraft>) => void;
  onExpand: () => void; onConsent: (v: boolean) => void; onHoneypot: (v: string) => void;
}) {
  const lead = state.lead;
  const memberCount = Math.max(0, state.groupSize - 1);
  return (
    <div className="space-y-5">
      {state.detailsCollapsed ? (
        <div className={`${R_CARD} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="font-headline text-base font-bold text-landing-near-black">Confirm your details</p>
            <p className="font-landing-body text-base text-landing-on-surface">{`Registering as ${lead.name} · ${lead.email}`}</p>
          </div>
          <button type="button" onClick={onExpand} className={R_BTN_SECONDARY}>Change</button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Full name" autoComplete="name" value={lead.name} onChange={(v) => onLead({ name: v })} error={errors["lead.name"]} />
          <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={lead.email} readOnly={state.emailLocked} hint={state.emailLocked ? "This is your account email." : undefined} onChange={(v) => onLead({ email: v })} error={errors["lead.email"]} />
          <TextField label="WhatsApp number" type="tel" inputMode="tel" autoComplete="tel" placeholder="923001234567" hint="With country code" value={lead.whatsapp} onChange={(v) => onLead({ whatsapp: v })} error={errors["lead.whatsapp"]} />
          {config.professions.length > 0 && (
            <SelectField label="Profession" value={lead.profession} options={config.professions} onChange={(v) => onLead({ profession: v })} error={errors["lead.profession"]} />
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="City / Country" autoComplete="address-level2" value={lead.city} onChange={(v) => onLead({ city: v })} error={errors["lead.city"]} />
        {config.discoveryOptions.length > 0 && (
          <SelectField label="How did you hear about us?" hint="Optional" value={lead.discovery} options={config.discoveryOptions} onChange={(v) => onLead({ discovery: v })} />
        )}
      </div>

      {memberCount > 0 && (
        <section aria-labelledby="members-h" className="space-y-3">
          <h3 id="members-h" className="font-headline text-base font-bold text-landing-near-black">Group members</h3>
          <p className="font-landing-body text-sm text-landing-muted">You are the group lead. Each member gets their own confirmation email.</p>
          {state.members.slice(0, memberCount).map((m, i) => {
            const n = i + 2;
            // Visible labels carry the member number so every field has one unambiguous accessible name.
            return (
              <fieldset key={i} className={`${R_CARD} grid gap-3 md:grid-cols-2`}>
                <legend className="px-1 font-headline text-sm font-bold text-landing-deep">{`Member ${n}`}</legend>
                <TextField label={`Member ${n} full name`} value={m.name} onChange={(v) => onMember(i, { name: v })} error={errors[`members.${i}.name`]} />
                <TextField label={`Member ${n} email`} type="email" inputMode="email" value={m.email} onChange={(v) => onMember(i, { email: v })} error={errors[`members.${i}.email`]} />
                <TextField label={`Member ${n} WhatsApp number`} type="tel" inputMode="tel" hint="With country code" value={m.whatsapp} onChange={(v) => onMember(i, { whatsapp: v })} error={errors[`members.${i}.whatsapp`]} />
                {config.professions.length > 0 && (
                  <SelectField label={`Member ${n} profession`} value={m.profession} options={config.professions} onChange={(v) => onMember(i, { profession: v })} error={errors[`members.${i}.profession`]} />
                )}
              </fieldset>
            );
          })}
        </section>
      )}

      {/* Honeypot: invisible to people and screen readers; bots that fill every field get silently dropped by the server. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={state.honeypot} onChange={(e) => onHoneypot(e.target.value)} />
        </label>
      </div>

      {isFree && <ConsentField checked={state.consent} onChange={onConsent} error={errors.consent} />}
    </div>
  );
}
