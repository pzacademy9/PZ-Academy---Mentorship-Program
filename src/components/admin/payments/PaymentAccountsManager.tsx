"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp, EyeOff, Globe2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { PaymentAccountFull } from "@/lib/data/landing-payment-accounts";
import type { PaymentCountry, PaymentCountryAccount } from "@/lib/data/landing-payment-countries";
import { HELP, ICON_BTN } from "../landing/registration/styles";
import { AccountDialog } from "./AccountDialog";
import { AddCountryDialog, EditCountryDialog } from "./CountryDialogs";
import { send } from "./send";

const KIND_LABEL = { bank: "Bank", wallet: "Wallet", paypal: "PayPal" } as const;
const KIND_CLASS = {
  bank: "bg-pz-secondary-container text-pz-on-secondary-container",
  wallet: "bg-pz-primary-container text-pz-on-primary-container",
  paypal: "bg-pz-surface-container-high text-pz-on-surface",
} as const;

type Modal =
  | { type: "add-country" }
  | { type: "add-account"; regionKey?: string }
  | { type: "edit-account"; key: string }
  | { type: "edit-country"; regionKey: string }
  | null;

export function PaymentAccountsManager({ countries, accounts }: { countries: PaymentCountry[]; accounts: PaymentAccountFull[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const byKey = new Map(accounts.map((a) => [a.key, a]));

  const { run: toggle, pendingKey } = useAsyncAction(async (a: PaymentCountryAccount) => {
    const res = await send(`/api/admin/payment-accounts/${a.key}`, "PATCH", { active: !a.active });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(a.active ? `${a.label} is hidden from students.` : `${a.label} is shown to students.`);
    router.refresh();
  }, { getKey: (a) => a.key });

  const { run: move } = useAsyncAction(async (country: PaymentCountry, from: number, to: number) => {
    const keys = country.accounts.map((a) => a.key);
    [keys[from], keys[to]] = [keys[to], keys[from]];
    const res = await send(`/api/admin/payment-countries/${country.regionKey}/accounts`, "PUT", { accountKeys: keys });
    if (!res.ok) { toast.error(res.error); return; }
    router.refresh();
  });

  const accountCount = new Set(countries.flatMap((c) => c.accounts.map((a) => a.key))).size;
  const editingAccount = modal?.type === "edit-account" ? byKey.get(modal.key) ?? null : null;
  const editingCountry = modal?.type === "edit-country" ? countries.find((c) => c.regionKey === modal.regionKey) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={HELP}>{`${countries.length} ${countries.length === 1 ? "country" : "countries"}, ${accountCount} ${accountCount === 1 ? "account" : "accounts"}`}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setModal({ type: "add-country" })}>
            <Globe2 aria-hidden="true" /> Add country
          </Button>
          <Button type="button" disabled={countries.length === 0} onClick={() => setModal({ type: "add-account" })}>
            <Plus aria-hidden="true" /> Add account
          </Button>
        </div>
      </div>

      {countries.map((c) => {
        const hidden = c.accounts.filter((a) => !a.active).length;
        return (
          <section key={c.regionKey} data-testid={`country-${c.regionKey}`} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={cn("font-headline text-lg font-bold", c.active ? "text-pz-on-surface" : "text-pz-on-surface-variant")}>{c.name}</h2>
                <span className="rounded bg-pz-surface-container-high px-2 py-0.5 font-mono text-xs font-semibold text-pz-on-surface-variant">{c.regionKey}</span>
                <span className={HELP}>{c.accounts.length === 1 ? "1 account" : `${c.accounts.length} accounts`}</span>
                {hidden > 0 && <span className={HELP}>{`${hidden} hidden`}</span>}
                {!c.active && <span className={HELP}>Not in use</span>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModal({ type: "edit-country", regionKey: c.regionKey })}>
                Edit country
              </Button>
            </div>

            {c.accounts.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-pz-warning" />
                  <div>
                    <p className="font-body text-sm font-semibold text-pz-on-surface">No accounts yet: pages use their own list</p>
                    <p className={HELP}>Add at least one account and every page for this country will use it.</p>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setModal({ type: "add-account", regionKey: c.regionKey })}>
                  <Plus aria-hidden="true" /> Add account
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {c.accounts.map((a, i) => {
                  const full = byKey.get(a.key);
                  const busy = pendingKey === a.key;
                  return (
                    <li
                      key={a.key}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-xl border border-pz-outline-variant p-4",
                        a.active ? "bg-pz-surface-container-lowest" : "bg-pz-surface-container-low opacity-80",
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <button type="button" className={ICON_BTN} aria-label={`Move ${a.label} up`} disabled={i === 0} onClick={() => void move(c, i, i - 1)}>
                          <ChevronUp aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <button type="button" className={ICON_BTN} aria-label={`Move ${a.label} down`} disabled={i === c.accounts.length - 1} onClick={() => void move(c, i, i + 1)}>
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="min-w-0 grow basis-60 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={cn("font-body text-base font-semibold", a.active ? "text-pz-on-surface" : "text-pz-on-surface-variant line-through")}>{a.label}</h3>
                          <span className={cn("rounded-full px-2.5 py-0.5 font-body text-xs font-semibold", KIND_CLASS[a.kind])}>{KIND_LABEL[a.kind]}</span>
                          {!a.active && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pz-surface-container-high px-2.5 py-0.5 font-body text-xs text-pz-on-surface-variant">
                              <EyeOff aria-hidden="true" className="h-3 w-3" /> Hidden from students
                            </span>
                          )}
                          {full?.displayText && <span className={HELP}>{full.displayText}</span>}
                        </div>
                        {full && full.rows.length > 0 && (
                          <dl className="flex flex-wrap gap-x-4 gap-y-1">
                            {full.rows.map((r, j) => (
                              <div key={j} className="flex min-w-0 gap-1 font-body text-xs">
                                <dt className="text-pz-on-surface-variant">{r.label}:</dt>
                                <dd className="break-all font-medium text-pz-on-surface">{r.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={HELP}>Shown to students</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={a.active}
                          aria-label={`Shown to students: ${a.label}`}
                          disabled={busy}
                          onClick={() => void toggle(a)}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 max-md:my-2",
                            a.active ? "bg-pz-primary" : "bg-pz-outline-variant",
                          )}
                        >
                          <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", a.active ? "translate-x-5" : "translate-x-0.5")} />
                        </button>
                        <button type="button" className={ICON_BTN} aria-label={`Edit ${a.label}`} onClick={() => setModal({ type: "edit-account", key: a.key })}>
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {modal?.type === "add-country" && <AddCountryDialog onClose={() => setModal(null)} />}
      {modal?.type === "add-account" && (
        <AccountDialog account={null} countries={countries} presetRegionKey={modal.regionKey} onClose={() => setModal(null)} />
      )}
      {editingAccount && <AccountDialog key={editingAccount.key} account={editingAccount} countries={countries} onClose={() => setModal(null)} />}
      {editingCountry && (
        <EditCountryDialog
          key={editingCountry.regionKey}
          country={editingCountry}
          accounts={accounts}
          onClose={() => setModal(null)}
          onCreateAccount={(regionKey) => setModal({ type: "add-account", regionKey })}
        />
      )}
    </div>
  );
}
