"use client";

import { useId, useMemo, useState } from "react";
import { Globe2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COUNTRIES, type Country } from "@/lib/landing/countries";
import { regionKeyProblem } from "@/lib/landing/link-names";
import { CURRENCY_RE, FIELD_MAX, MAX_MONEY, type PriceCell, type RegionDef } from "@/lib/landing/registration/config";
import type { LandingContent } from "@/lib/landing/content";
import type { PaymentAccountSummary } from "../registration/RegistrationSetup";
import { CONTROL, HELP, LABEL } from "../registration/styles";

/** "" -> null; otherwise a whole amount >= 0, or null when it is not a number (same rule as the price table). */
function toAmount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_MONEY, Math.max(0, Math.round(n))) : null;
}

type Names = Pick<LandingContent, "registration" | "modules">;
/** registrationConfigSchema allows 12 regions. */
const MAX_COUNTRIES = 12;

function CountryForm({
  content, accounts, onAdd, onCancel,
}: {
  content: Names; accounts: PaymentAccountSummary[];
  onAdd: (region: RegionDef, prices: Record<string, PriceCell>) => void; onCancel: () => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Country | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [classTime, setClassTime] = useState("");
  const [accountKeys, setAccountKeys] = useState<string[]>([]);
  const [regular, setRegular] = useState<Record<string, string>>({});
  const [early, setEarly] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const choices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRIES
      .filter((c) => !content.registration.regions.some((g) => g.key === c.regionKey))
      .filter((c) => q === "" || c.name.toLowerCase().includes(q) || c.regionKey.toLowerCase() === q || c.iso2.toLowerCase() === q);
  }, [query, content.registration.regions]);

  function pick(c: Country) {
    setPicked(c);
    setName(c.name);
    setCurrency(c.currency);
    setTimezone(c.timezoneLabel);
    setError(regionKeyProblem(c.regionKey, content));
  }

  function submit() {
    if (!picked) { setError("Choose a country first."); return; }
    if (content.registration.regions.length >= MAX_COUNTRIES) {
      setError(`A page can have up to ${MAX_COUNTRIES} countries. Remove one in Registration setup first.`);
      return;
    }
    const keyProblem = regionKeyProblem(picked.regionKey, content);
    if (keyProblem) { setError(keyProblem); return; }
    const label = name.trim() || picked.name;
    if (!CURRENCY_RE.test(currency)) { setError("The currency must be a 3-letter code, for example AED."); return; }
    if (accounts.length === 0) {
      setError("There are no payment accounts yet, so people in this country would have nowhere to pay. Ask a developer to add one first.");
      return;
    }
    if (accountKeys.length === 0) {
      setError(`Pick at least one payment account for ${label}, so people there know where to pay.`);
      return;
    }
    const prices: Record<string, PriceCell> = {};
    for (const o of content.registration.options) {
      const amount = toAmount(regular[o.key] ?? "");
      if (amount === null) continue;
      const cell: PriceCell = { amount };
      const e = toAmount(early[o.key] ?? "");
      if (e !== null) cell.earlyAmount = e;
      prices[o.key] = cell;
    }
    onAdd({
      key: picked.regionKey, label, currency, classTime: classTime.trim(), timezoneLabel: timezone.trim(), accountKeys,
    }, prices);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={`${ids}-q`} className={LABEL}>Search countries</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden="true" />
          <input id={`${ids}-q`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example Qatar" className={cn(CONTROL, "pl-9")} />
        </div>
        <div role="radiogroup" aria-label="Country" className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-1">
          {choices.length === 0 && <p className={cn(HELP, "px-2 py-3")}>No country matches. Every country on the list may already be on this page.</p>}
          {choices.map((c) => {
            const on = picked?.regionKey === c.regionKey;
            return (
              <button
                key={c.regionKey}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(c)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left font-body text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11",
                  on ? "bg-pz-primary-container/50 font-semibold text-pz-on-surface" : "text-pz-on-surface hover:bg-pz-surface-container-high",
                )}
              >
                <span>{c.name}</span>
                <span className="text-xs text-pz-on-surface-variant">{c.currency}</span>
              </button>
            );
          })}
        </div>
      </div>

      {picked && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={LABEL}>Country name</span>
              <input maxLength={FIELD_MAX.name} value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} />
            </label>
            <label className="space-y-1">
              <span className={LABEL}>Currency</span>
              <input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} className={CONTROL} />
            </label>
            <label className="space-y-1">
              <span className={LABEL}>Class time</span>
              <input maxLength={FIELD_MAX.name} placeholder="7:30 – 8:30 PM" value={classTime} onChange={(e) => setClassTime(e.target.value)} className={CONTROL} />
            </label>
            <label className="space-y-1">
              <span className={LABEL}>Time zone name</span>
              <input maxLength={FIELD_MAX.name} value={timezone} onChange={(e) => setTimezone(e.target.value)} className={CONTROL} />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className={LABEL}>Payment accounts</legend>
            <p className={HELP}>People in this country see only the accounts you tick here.</p>
            {accounts.map((a) => (
              <label key={a.key} className="flex items-start gap-2 font-body text-sm text-pz-on-surface">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={accountKeys.includes(a.key)}
                  onChange={() => setAccountKeys((ks) => (ks.includes(a.key) ? ks.filter((k) => k !== a.key) : [...ks, a.key]))}
                />
                <span>
                  <span className="block font-semibold">{a.label}</span>
                  <span className={HELP}>{a.displayText}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {content.registration.options.length > 0 && (
            <fieldset className="space-y-2">
              <legend className={LABEL}>Price per person in {currency || "this currency"}</legend>
              <p className={HELP}>Whole numbers. Leave a price empty if that option is not sold in this country. Early Bird is optional.</p>
              <div className="space-y-2">
                {content.registration.options.map((o) => (
                  <div key={o.key} className="grid grid-cols-[1fr_6.5rem_6.5rem] items-center gap-2">
                    <span className="font-body text-sm text-pz-on-surface">{o.label}</span>
                    <input type="number" inputMode="numeric" min={0} step={1} aria-label={`${o.label} price`} placeholder="Regular" value={regular[o.key] ?? ""} onChange={(e) => setRegular((m) => ({ ...m, [o.key]: e.target.value }))} className={CONTROL} />
                    <input type="number" inputMode="numeric" min={0} step={1} aria-label={`${o.label} Early Bird price`} placeholder="Early Bird" value={early[o.key] ?? ""} onChange={(e) => setEarly((m) => ({ ...m, [o.key]: e.target.value }))} className={CONTROL} />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-pz-error-container px-3 py-2 font-body text-sm text-pz-on-error-container">{error}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Add country</Button>
      </div>
    </form>
  );
}

/** Adds a country to the page: its currency, class time, payment accounts and prices. */
export function AddCountryDialog({
  open, onOpenChange, content, accounts, onAdd,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
  content: Names; accounts: PaymentAccountSummary[];
  onAdd: (region: RegionDef, prices: Record<string, PriceCell>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto bg-pz-surface-container-lowest">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-headline text-xl text-pz-on-surface">
            <Globe2 className="h-5 w-5 text-pz-primary" aria-hidden="true" />
            Add a country
          </DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            People in this country see its prices, class time and payment accounts.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CountryForm
            content={content}
            accounts={accounts}
            onCancel={() => onOpenChange(false)}
            onAdd={(r, p) => { onAdd(r, p); onOpenChange(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
