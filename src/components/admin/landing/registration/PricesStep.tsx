// src/components/admin/landing/registration/PricesStep.tsx
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FIELD_MAX, MAX_MONEY, type PriceCell, type RegistrationConfig } from "@/lib/landing/registration/config";
import { REGION_PRESETS, addRegion, copyPriceRow, removeRegion, setGroupTotal, setPriceCell, updateRegion } from "@/lib/landing/registration/admin-edit";
import { CONTROL, HELP, LABEL, ICON_BTN } from "./styles";

/** "" -> null; anything else -> a whole number >= 0 (fractions are rounded, money is always whole), or null if it is not a number. */
function toAmount(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_MONEY, Math.max(0, Math.round(n))) : null;
}

export function PricesStep({ r, onChange }: { r: RegistrationConfig; onChange: (n: RegistrationConfig) => void }) {
  const unused = REGION_PRESETS.filter((p) => !r.regions.some((g) => g.key === p.key));
  const [toAdd, setToAdd] = useState(unused[0]?.key ?? "");
  const fixedTiers = r.tiers.filter((t) => t.minSize === t.maxSize);
  // Raw text of a Regular price while it is empty: the cell (and its Early Bird / group totals) is only
  // removed when the field loses focus empty, so backspacing to retype never destroys other data.
  const [emptied, setEmptied] = useState<Record<string, boolean>>({});

  function setRegular(o: string, g: string, v: string) {
    const amount = toAmount(v);
    const cell = r.prices[o]?.[g];
    const id = `${o}|${g}`;
    if (amount === null) { setEmptied((m) => ({ ...m, [id]: true })); return; }
    setEmptied((m) => ({ ...m, [id]: false }));
    onChange(setPriceCell(r, o, g, { ...(cell ?? {}), amount } as PriceCell));
  }
  function commitRegular(o: string, g: string) {
    const id = `${o}|${g}`;
    if (!emptied[id]) return;
    setEmptied((m) => ({ ...m, [id]: false }));
    onChange(setPriceCell(r, o, g, null));
  }
  function setEarly(o: string, g: string, v: string) {
    const cell = r.prices[o]?.[g];
    if (!cell) return;
    const early = toAmount(v);
    const next: PriceCell = { ...cell };
    if (early === null) delete next.earlyAmount;
    else next.earlyAmount = early;
    onChange(setPriceCell(r, o, g, next));
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="countries-h" className="space-y-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
        <h4 id="countries-h" className={LABEL}>Countries</h4>
        <p className={HELP}>Each country has its own currency, class time and payment accounts. The page guesses the visitor&apos;s country and they can change it in one tap.</p>
        <ul className="space-y-2">
          {r.regions.map((g) => (
            <li key={g.key} className="grid grid-cols-2 gap-2 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest p-2 lg:grid-cols-[1.4fr_0.6fr_1fr_1fr_auto]">
              <input aria-label={`Country name for ${g.key}`} maxLength={FIELD_MAX.name} className={CONTROL} value={g.label} onChange={(e) => onChange(updateRegion(r, g.key, { label: e.target.value }))} />
              <input aria-label={`Currency for ${g.label}`} className={CONTROL} value={g.currency} maxLength={3} onChange={(e) => onChange(updateRegion(r, g.key, { currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") }))} />
              <input aria-label={`Class time for ${g.label}`} maxLength={FIELD_MAX.name} placeholder="7:30 – 8:30 PM" className={CONTROL} value={g.classTime} onChange={(e) => onChange(updateRegion(r, g.key, { classTime: e.target.value }))} />
              <input aria-label={`Time zone label for ${g.label}`} maxLength={FIELD_MAX.name} placeholder="Pakistan Standard Time" className={CONTROL} value={g.timezoneLabel} onChange={(e) => onChange(updateRegion(r, g.key, { timezoneLabel: e.target.value }))} />
              <button type="button" aria-label={`Remove ${g.label}`} className={ICON_BTN} onClick={() => onChange(removeRegion(r, g.key))}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {unused.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className={LABEL}>Add country</span>
              <select aria-label="Add country" className={CONTROL} value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
                {unused.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.currency})</option>)}
              </select>
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant px-3 py-2 font-body text-sm font-semibold text-pz-on-surface hover:bg-pz-surface-container-high max-md:min-h-11"
              onClick={() => { const p = unused.find((x) => x.key === toAdd) ?? unused[0]; onChange(addRegion(r, p)); setToAdd(unused.filter((x) => x.key !== p.key)[0]?.key ?? ""); }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add
            </button>
          </div>
        )}
        <label className="block space-y-1">
          <span className={LABEL}>Default country</span>
          <span className={`block ${HELP}`}>Used when we can&apos;t tell where the visitor is.</span>
          <select aria-label="Default country" className={CONTROL} value={r.defaultRegionKey} onChange={(e) => onChange({ ...r, defaultRegionKey: e.target.value })}>
            {r.regions.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
      </section>

      <section aria-labelledby="prices-h" className="space-y-2">
        <h4 id="prices-h" className={LABEL}>Price per person</h4>
        <p className={HELP}>Type the price one person pays, in whole numbers. Leave Early Bird empty if there is no Early Bird price. An empty Regular price means the option is not sold in that country.</p>
        <div className="overflow-x-auto rounded-xl border border-pz-outline-variant">
          <table aria-label="Prices by country" className="min-w-full border-collapse font-body text-sm">
            <thead className="bg-pz-surface-container-high text-pz-on-surface">
              <tr>
                <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-pz-surface-container-high px-3 py-2 text-left">Country</th>
                {r.options.map((o) => <th key={o.key} scope="colgroup" colSpan={2} className="border-l border-pz-outline-variant px-3 py-2 text-left">{o.label}</th>)}
                <th scope="col" rowSpan={2} className="border-l border-pz-outline-variant px-3 py-2 text-left">Copy this row</th>
              </tr>
              <tr>
                {r.options.flatMap((o) => [
                  <th key={`${o.key}-r`} scope="col" className="border-l border-pz-outline-variant px-3 py-1 text-left text-xs font-semibold">Regular</th>,
                  <th key={`${o.key}-e`} scope="col" className="px-3 py-1 text-left text-xs font-semibold">Early Bird</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {r.regions.map((g) => (
                <tr key={g.key} className="border-t border-pz-outline-variant bg-pz-surface-container-lowest">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-pz-surface-container-lowest px-3 py-2 text-left font-semibold text-pz-on-surface">
                    {g.label} <span className="font-normal text-pz-on-surface-variant">{g.currency}</span>
                  </th>
                  {r.options.flatMap((o) => {
                    const cell = r.prices[o.key]?.[g.key];
                    return [
                      <td key={`${o.key}-r`} className="border-l border-pz-outline-variant px-2 py-1.5">
                        <input type="number" inputMode="numeric" min={0} step={1} aria-label={`${o.label} regular price in ${g.label}`} className={`${CONTROL} w-24`} value={emptied[`${o.key}|${g.key}`] ? "" : cell ? String(cell.amount) : ""} onChange={(e) => setRegular(o.key, g.key, e.target.value)} onBlur={() => commitRegular(o.key, g.key)} />
                      </td>,
                      <td key={`${o.key}-e`} className="px-2 py-1.5">
                        <input type="number" inputMode="numeric" min={0} step={1} disabled={!cell} aria-label={`${o.label} Early Bird price in ${g.label}`} className={`${CONTROL} w-24 disabled:opacity-50`} value={cell?.earlyAmount !== undefined ? String(cell.earlyAmount) : ""} onChange={(e) => setEarly(o.key, g.key, e.target.value)} />
                      </td>,
                    ];
                  })}
                  <td className="border-l border-pz-outline-variant px-2 py-1.5">
                    <select aria-label={`Copy prices into ${g.label} from`} className={CONTROL} value="" onChange={(e) => { if (e.target.value) onChange(copyPriceRow(r, e.target.value, g.key)); }}>
                      <option value="">Copy prices from…</option>
                      {r.regions.filter((x) => x.key !== g.key).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fixedTiers.length > 0 && (
        <details className="rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
          <summary className={`cursor-pointer ${LABEL}`}>Exact group totals (optional)</summary>
          <p className={`mt-2 ${HELP}`}>Use this only when the group price is a hand-set total, for example PKR 11,500 for a group of 3 during Early Bird. The regular total is used after Early Bird, the Early Bird total while it runs; both only when someone picks exactly one option, live. Leave empty to use the group discount.</p>
          <div className="mt-3 space-y-3">
            {r.options.map((o) => (
              <fieldset key={o.key} className="space-y-2">
                <legend className={LABEL}>{o.label}</legend>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {r.regions.flatMap((g) => fixedTiers.flatMap((t) => {
                    const cell = r.prices[o.key]?.[g.key];
                    return [
                      <label key={`${g.key}-${t.key}`} className="space-y-1">
                        <span className={HELP}>{g.label} · {t.label}</span>
                        <input type="number" inputMode="numeric" min={0} step={1} disabled={!cell} aria-label={`${o.label} ${t.label} total in ${g.label}`} className={`${CONTROL} disabled:opacity-50`} value={cell?.groupTotals?.[t.key] !== undefined ? String(cell.groupTotals[t.key]) : ""} onChange={(e) => onChange(setGroupTotal(r, o.key, g.key, t.key, toAmount(e.target.value)))} />
                      </label>,
                      // Early Bird total: only when the cell has an Early Bird price (Task 2's earlyGroupTotals).
                      cell?.earlyAmount !== undefined ? (
                        <label key={`${g.key}-${t.key}-early`} className="space-y-1">
                          <span className={HELP}>{g.label} · {t.label} · Early Bird</span>
                          <input type="number" inputMode="numeric" min={0} step={1} aria-label={`${o.label} ${t.label} Early Bird total in ${g.label}`} className={CONTROL} value={cell.earlyGroupTotals?.[t.key] !== undefined ? String(cell.earlyGroupTotals[t.key]) : ""} onChange={(e) => onChange(setGroupTotal(r, o.key, g.key, t.key, toAmount(e.target.value), true))} />
                        </label>
                      ) : null,
                    ];
                  }))}
                </div>
              </fieldset>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
