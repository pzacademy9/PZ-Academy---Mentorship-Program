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
import { MAX_ACCOUNTS_PER_COUNTRY, MAX_ACCOUNT_ROWS } from "@/lib/validations/landing-payment";
import { CONTROL, HELP, ICON_BTN, LABEL } from "../landing/registration/styles";
import { send } from "./send";

const ERROR = "block font-body text-xs font-medium text-pz-danger";

type Kind = PaymentAccountFull["kind"];
const KIND_LABEL: Record<Kind, string> = { bank: "Bank", wallet: "Wallet", paypal: "PayPal" };

/**
 * Add a new account (and put it on one country's list) or edit an existing one.
 * New account: the account is created first, then added at the end of the chosen country's list.
 */
export function AccountDialog({
  account, countries, presetRegionKey, onClose,
}: {
  account: PaymentAccountFull | null;
  countries: PaymentCountry[];
  presetRegionKey?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = account !== null;
  const [label, setLabel] = useState(account?.label ?? "");
  const [kind, setKind] = useState<Kind>(account?.kind ?? "bank");
  const [rows, setRows] = useState(account && account.rows.length > 0 ? account.rows : [{ label: "", value: "" }]);
  const [displayText, setDisplayText] = useState(account?.displayText ?? "");
  const [regionKey, setRegionKey] = useState(presetRegionKey ?? countries[0]?.regionKey ?? "");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const setRow = (i: number, patch: Partial<{ label: string; value: string }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const { run: save, pending } = useAsyncAction(async () => {
    setError(null);
    const body = { label, kind, rows, displayText };
    if (editing) {
      const res = await send(`/api/admin/payment-accounts/${account.key}`, "PATCH", body);
      if (!res.ok) { setError({ message: res.error, field: res.field }); return; }
      toast.success(`${label.trim() || account.label} saved.`);
      router.refresh();
      onClose();
      return;
    }
    const country = countries.find((c) => c.regionKey === regionKey);
    if (!country) { setError({ message: "Choose a country for this account.", field: "country" }); return; }
    if (country.accounts.length >= MAX_ACCOUNTS_PER_COUNTRY) {
      setError({ message: "That country already has 12 accounts.", field: "country" });
      return;
    }
    const created = await send<{ key: string }>("/api/admin/payment-accounts", "POST", body);
    if (!created.ok) { setError({ message: created.error, field: created.field }); return; }
    const listed = await send(`/api/admin/payment-countries/${country.regionKey}/accounts`, "PUT", {
      accountKeys: [...country.accounts.map((a) => a.key), created.data.key],
    });
    router.refresh();
    if (!listed.ok) {
      toast.error(`The account was saved, but could not be added to ${country.name}. Add it from Edit country.`);
      onClose();
      return;
    }
    toast.success(`${label.trim()} added to ${country.name}.`);
    onClose();
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${account.label}` : "Add account"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes show on every page that uses this account."
              : "Students see these details when they pay. The account is added at the end of the country's list."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          {!editing && (
            <div className="space-y-1">
              <label htmlFor="pa-country" className={LABEL}>Country</label>
              <select id="pa-country" className={CONTROL} value={regionKey} onChange={(e) => setRegionKey(e.target.value)}>
                {countries.map((c) => <option key={c.regionKey} value={c.regionKey}>{c.name} ({c.regionKey})</option>)}
              </select>
              {error?.field === "country" && <span className={ERROR}>{error.message}</span>}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="pa-label" className={LABEL}>Account name</label>
            <input id="pa-label" className={CONTROL} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Faysal Bank" />
            {error?.field === "label" && <span className={ERROR}>{error.message}</span>}
          </div>
          <div className="space-y-1">
            <label htmlFor="pa-kind" className={LABEL}>Type</label>
            <select id="pa-kind" className={CONTROL} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <fieldset className="space-y-2">
            <legend className={LABEL}>Details students see</legend>
            <p className={HELP}>For example: Account title, IBAN, Branch. Up to {MAX_ACCOUNT_ROWS} details.</p>
            {rows.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <input aria-label={`Detail ${i + 1} name`} className={CONTROL} value={r.label} maxLength={80} placeholder="Name" onChange={(e) => setRow(i, { label: e.target.value })} />
                <input aria-label={`Detail ${i + 1} value`} className={CONTROL} value={r.value} maxLength={200} placeholder="Value" onChange={(e) => setRow(i, { value: e.target.value })} />
                <button type="button" className={ICON_BTN} aria-label={`Remove detail ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))}
            {error?.field?.startsWith("rows") && <span className={ERROR}>{error.message}</span>}
            {rows.length < MAX_ACCOUNT_ROWS && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}>
                <Plus aria-hidden="true" /> Add a detail
              </Button>
            )}
          </fieldset>
          <div className="space-y-1">
            <label htmlFor="pa-note" className={LABEL}>Short note (optional)</label>
            <input id="pa-note" className={CONTROL} value={displayText} maxLength={120} onChange={(e) => setDisplayText(e.target.value)} placeholder="Instant clearance" />
            {error?.field === "displayText" && <span className={ERROR}>{error.message}</span>}
          </div>
          {error && !["country", "label", "displayText"].includes(error.field ?? "") && !error.field?.startsWith("rows") && (
            <p role="alert" className={ERROR}>{error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save account"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
