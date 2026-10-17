"use client";

import { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cleanWhatsappNumber } from "@/lib/landing/whatsapp";

interface WhatsappRow { id?: string; label: string; number: string; official: boolean }

const LABEL = "font-body text-sm font-semibold text-pz-on-surface";
const HELP = "font-body text-xs text-pz-on-surface-variant";
const ERROR = "font-body text-xs font-medium text-pz-danger";
const CONTROL =
  "w-full rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 font-body text-sm text-pz-on-surface placeholder:text-pz-on-surface-variant/60 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11 max-md:text-base";
const LINK_BTN =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-body text-xs font-semibold text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11";

/** Pick a WhatsApp number from the shared list. Stores digits only. */
export function WhatsappNumberField({
  label, value, onChange, path, help,
}: { label: string; value: string; onChange: (v: string) => void; path?: string; help?: string }) {
  const id = useId();
  const [rows, setRows] = useState<WhatsappRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/landing-whatsapp");
        if (!res.ok) throw new Error("load");
        const body = (await res.json()) as { numbers?: WhatsappRow[] };
        if (alive) setRows(body.numbers ?? []);
      } catch {
        if (alive) { setLoadError(true); setRows([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const list = rows ?? [];
  const known = list.some((r) => r.number === value);
  const shown = value !== "" ? value : list[0]?.number ?? "";
  const selectedRow = list.find((r) => r.number === value);
  const canDelete = !!selectedRow && !selectedRow.official && !!selectedRow.id;

  async function save() {
    const clean = cleanWhatsappNumber(digits);
    if (name.trim() === "") { setFormError("Give the number a name, like Sales team."); return; }
    if (!clean) { setFormError("Enter the number with its country code, 8 to 15 digits."); return; }
    setBusy(true); setFormError(null);
    try {
      const res = await fetch("/api/admin/landing-whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name.trim(), number: clean }),
      });
      const body = (await res.json().catch(() => ({}))) as { number?: WhatsappRow; error?: string };
      if (!res.ok || !body.number) { setFormError(body.error ?? "We couldn't save that number. Please try again."); return; }
      const added = body.number;
      setRows((prev) => [...(prev ?? []), added]);
      onChange(added.number);
      setAdding(false); setName(""); setDigits("");
    } catch {
      setFormError("We couldn't save that number. Please check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!selectedRow?.id) return;
    setBusy(true); setFormError(null);
    try {
      const res = await fetch(`/api/admin/landing-whatsapp/${selectedRow.id}`, { method: "DELETE" });
      if (!res.ok) { setFormError("We couldn't remove that number. Please try again."); return; }
      setRows((prev) => (prev ?? []).filter((r) => r.id !== selectedRow.id));
      setConfirmingDelete(false);
    } catch {
      setFormError("We couldn't remove that number. Please check your connection and try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {help && <p className={HELP}>{help}</p>}
      <select id={id} value={shown} data-field-path={path} onChange={(e) => { setConfirmingDelete(false); onChange(e.target.value); }} className={cn(CONTROL, "h-auto")}>
        {list.map((r) => <option key={r.number} value={r.number}>{r.label} ({r.number})</option>)}
        {!known && value !== "" && <option value={value}>{value} (not in list)</option>}
      </select>
      {loadError && <p className={ERROR}>We couldn&apos;t load your saved numbers. The PZ Academy numbers still work.</p>}

      {confirmingDelete && selectedRow && (
        <div className="space-y-2 rounded-md border border-pz-outline-variant bg-pz-surface-container-low p-3">
          <p className="font-body text-sm text-pz-on-surface">Remove this number from the list? Pages already using it keep working.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={remove} className={cn(LINK_BTN, "text-pz-danger")}>Yes, remove</button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className={LINK_BTN}>Keep it</button>
          </div>
        </div>
      )}

      {!adding ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAdding(true)} className={LINK_BTN}>Add a number</button>
          {canDelete && !confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={LINK_BTN} aria-label="Remove this number">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove this number
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-pz-outline-variant bg-pz-surface-container-low p-3">
          <div className="space-y-1">
            <label htmlFor={`${id}-name`} className={LABEL}>Name</label>
            <Input id={`${id}-name`} value={name} placeholder="Sales team" onChange={(e) => setName(e.target.value)} className={cn(CONTROL, "h-auto")} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-num`} className={LABEL}>Number</label>
            <Input id={`${id}-num`} value={digits} placeholder="923001234567" inputMode="tel" onChange={(e) => setDigits(e.target.value)} className={cn(CONTROL, "h-auto")} />
            <p className={HELP}>Include the country code. Spaces and + are fine.</p>
          </div>
          {formError && <p className={ERROR}>{formError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={save} className={cn(LINK_BTN, "text-pz-on-surface")}>Save number</button>
            <button type="button" onClick={() => { setAdding(false); setFormError(null); }} className={LINK_BTN}>Cancel</button>
          </div>
        </div>
      )}
      {!adding && formError && <p className={ERROR}>{formError}</p>}
    </div>
  );
}
