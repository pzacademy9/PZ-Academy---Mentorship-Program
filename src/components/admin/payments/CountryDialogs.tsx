"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { PaymentAccountFull } from "@/lib/data/landing-payment-accounts";
import type { PaymentCountry } from "@/lib/data/landing-payment-countries";
import { MAX_ACCOUNTS_PER_COUNTRY } from "@/lib/validations/landing-payment";
import { CONTROL, HELP, ICON_BTN, LABEL } from "../landing/registration/styles";
import { send } from "./send";

const ERROR = "block font-body text-xs font-medium text-pz-danger";

export function AddCountryDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [regionKey, setRegionKey] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const { run: save, pending } = useAsyncAction(async () => {
    setError(null);
    const res = await send("/api/admin/payment-countries", "POST", { regionKey: regionKey.trim().toUpperCase(), name });
    if (!res.ok) { setError({ message: res.error, field: res.field }); return; }
    toast.success(`${name.trim()} added. Now add its accounts.`);
    router.refresh();
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add country</DialogTitle>
          <DialogDescription>The code must match the region code used on your landing pages, for example PK or UAE.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1">
            <label htmlFor="pc-code" className={LABEL}>Country code</label>
            <input id="pc-code" className={CONTROL} value={regionKey} maxLength={6} onChange={(e) => setRegionKey(e.target.value.toUpperCase())} placeholder="PK" />
            {error?.field === "regionKey" && <span className={ERROR}>{error.message}</span>}
          </div>
          <div className="space-y-1">
            <label htmlFor="pc-name" className={LABEL}>Country name</label>
            <input id="pc-name" className={CONTROL} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Pakistan" />
            {error?.field === "name" && <span className={ERROR}>{error.message}</span>}
          </div>
          {error && error.field !== "regionKey" && error.field !== "name" && <p role="alert" className={ERROR}>{error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save country"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Rename or hide a country, and manage which accounts it lists. Adding or removing an account saves
 * straight away (the full list goes to the server); a country can never be left with no account once
 * it has one, so the last account has no remove button.
 */
export function EditCountryDialog({
  country, accounts, onClose, onCreateAccount,
}: {
  country: PaymentCountry;
  accounts: PaymentAccountFull[];
  onClose: () => void;
  onCreateAccount: (regionKey: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(country.name);
  const [active, setActive] = useState(country.active);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inCountry = new Set(country.accounts.map((a) => a.key));
  const available = accounts.filter((a) => !inCountry.has(a.key));
  const full = country.accounts.length >= MAX_ACCOUNTS_PER_COUNTRY;

  const { run: saveDetails, pending: savingDetails } = useAsyncAction(async () => {
    setError(null);
    const res = await send(`/api/admin/payment-countries/${country.regionKey}`, "PATCH", { name, active });
    if (!res.ok) { setError(res.error); return; }
    toast.success(`${name.trim()} saved.`);
    router.refresh();
    onClose();
  });

  const { run: saveList, pending: savingList } = useAsyncAction(async (keys: string[]) => {
    setError(null);
    const res = await send(`/api/admin/payment-countries/${country.regionKey}/accounts`, "PUT", { accountKeys: keys });
    if (!res.ok) { setError(res.error); return; }
    setPick("");
    router.refresh();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {country.name}</DialogTitle>
          <DialogDescription>Region code {country.regionKey}. Students on this country&apos;s pages see the accounts below, in this order.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveDetails(); }}>
            <div className="space-y-1">
              <label htmlFor="ec-name" className={LABEL}>Country name</label>
              <input id="ec-name" className={CONTROL} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 font-body text-sm text-pz-on-surface max-md:min-h-11">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Use this country&apos;s list on landing pages
            </label>
            <p className={HELP}>When off, each page shows its own accounts.</p>
            <Button type="submit" disabled={savingDetails}>{savingDetails ? "Saving..." : "Save country"}</Button>
          </form>

          <section className="space-y-2 border-t border-pz-outline-variant pt-4">
            <h3 className={LABEL}>Accounts in this country</h3>
            {country.accounts.length === 0 ? (
              <p className={HELP}>None yet. Pages for this country use their own list.</p>
            ) : (
              <ul className="space-y-1">
                {country.accounts.map((a) => (
                  <li key={a.key} className="flex items-center justify-between gap-2 rounded-md bg-pz-surface-container-low px-3 py-2 font-body text-sm text-pz-on-surface">
                    <span>{a.label}{!a.active && <span className={HELP}> (hidden)</span>}</span>
                    <button
                      type="button"
                      className={ICON_BTN}
                      aria-label={`Remove ${a.label} from ${country.name}`}
                      disabled={savingList || country.accounts.length === 1}
                      onClick={() => void saveList(country.accounts.filter((x) => x.key !== a.key).map((x) => x.key))}
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {country.accounts.length === 1 && <p className={HELP}>A country keeps at least one account. Hide the account instead if students should not see it.</p>}
            {!full && (
              <div className="space-y-2">
                {available.length > 0 && (
                  <div className="flex items-end gap-2">
                    <div className="grow space-y-1">
                      <label htmlFor="ec-pick" className={LABEL}>Add an existing account</label>
                      <select id="ec-pick" className={CONTROL} value={pick} onChange={(e) => setPick(e.target.value)}>
                        <option value="">Choose an account</option>
                        {available.map((a) => <option key={a.key} value={a.key}>{a.label}{a.active ? "" : " (hidden)"}</option>)}
                      </select>
                    </div>
                    <Button type="button" disabled={!pick || savingList} onClick={() => void saveList([...country.accounts.map((x) => x.key), pick])}>
                      Add to country
                    </Button>
                  </div>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={() => onCreateAccount(country.regionKey)}>
                  <Plus aria-hidden="true" /> Create a new account for {country.name}
                </Button>
              </div>
            )}
            {full && <p className={HELP}>This country has 12 accounts, the most it can have.</p>}
          </section>
          {error && <p role="alert" className={ERROR}>{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
